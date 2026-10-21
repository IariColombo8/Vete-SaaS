import { NextResponse } from "next/server"
import { z } from "zod"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"
import { cargarPlanesServidor } from "@/lib/planes-servidor"
import { planAllows } from "@/lib/plans"
import { cantidadValida, entregasDisponibles, mediosDisponibles, precioLineaWeb } from "@/lib/pedidos/reglas"
import { tiendaPublicaDesdeJson } from "@/lib/pedidos/tipos"
import { cargarPedido, iniciarPago, mensajePago, notificarPedido, origenDe } from "@/lib/pedidos/servidor"
import type { OfertaTipo } from "@/lib/supabase/types"

/**
 * Alta de un pedido desde la vidriera.
 *
 * POST { tenantId, items: [{ productoId, cantidad }], nombre, telefono, dni?,
 *        entrega, direccion?, nota?, medioPago }
 * Auth: cualquier usuario logueado (el comprador). Va por service_role.
 *
 * Los precios se calculan acá con el catálogo (nunca se confía en el total
 * del navegador) y se valida el stock. El cliente se busca por el email de
 * la cuenta y, si no existe, se da de alta en la veterinaria.
 *
 * Responde { ok, pedidoId, numero, pago } donde `pago` es lo que tiene que
 * hacer el navegador: redirigir a Mercado Pago, dibujar el QR o nada.
 */

const bodySchema = z.object({
  tenantId: z.string().min(1),
  items: z
    .array(z.object({ productoId: z.string().uuid(), cantidad: z.number().positive() }))
    .min(1)
    .max(60),
  nombre: z.string().trim().min(1).max(200),
  telefono: z.string().trim().min(6).max(50),
  dni: z.string().trim().max(20).optional().default(""),
  entrega: z.enum(["retiro", "envio"]),
  direccion: z.string().trim().max(300).optional().default(""),
  nota: z.string().trim().max(500).optional().default(""),
  medioPago: z.enum(["efectivo", "transferencia", "tarjeta", "qr"]),
})

interface FilaProducto {
  id: string
  nombre: string
  marca: string | null
  linea: string | null
  peso_kg: number | null
  imagen_url: string | null
  precio: number
  unidad: "un" | "kg"
  stock: number
  controla_stock: boolean
  publicado_en_landing: boolean
  oferta_activa: boolean | null
  oferta_tipo: OfertaTipo | null
  oferta_valor: number | null
  oferta_cantidad: number | null
  oferta_hasta: string | null
}

export async function POST(request: Request) {
  const admin = getAdminDb()
  if (!admin) return NextResponse.json({ ok: false, error: "Servicio no disponible" }, { status: 503 })

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const user = token ? await verificarToken(token) : null
  if (!user?.email) return NextResponse.json({ ok: false, error: "Iniciá sesión para comprar" }, { status: 401 })
  // Comprar exige cuenta de Google (pedido del dueño): el email queda
  // verificado por Google y es con el que se identifica al cliente.
  const conGoogle =
    user.app_metadata?.provider === "google" ||
    (user.identities ?? []).some((i) => i.provider === "google")
  if (!conGoogle) {
    return NextResponse.json({ ok: false, error: "Para comprar tenés que ingresar con tu cuenta de Google" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Revisá los datos del pedido" }, { status: 400 })
  const d = parsed.data
  if (d.entrega === "envio" && d.direccion.length < 4) {
    return NextResponse.json({ ok: false, error: "Falta la dirección de entrega" }, { status: 400 })
  }

  try {
    const [{ data: tenant }, { data: tiendaRaw }] = await Promise.all([
      admin.from("tenants").select("slug, plan").eq("slug", d.tenantId).maybeSingle(),
      admin.rpc("tienda_publica", { p_tenant: d.tenantId }),
    ])
    if (!tenant) return NextResponse.json({ ok: false, error: "Veterinaria no encontrada" }, { status: 404 })

    await cargarPlanesServidor()
    const tienda = tiendaPublicaDesdeJson(tiendaRaw as Record<string, unknown> | null)
    if (!tienda.pedidosHabilitados || !planAllows(tenant.plan as string, "productos")) {
      return NextResponse.json({ ok: false, error: "Esta veterinaria no está tomando pedidos online" }, { status: 409 })
    }
    if (!entregasDisponibles(tienda).includes(d.entrega)) {
      return NextResponse.json({ ok: false, error: "Esa forma de entrega no está disponible" }, { status: 400 })
    }
    if (!mediosDisponibles(tienda).includes(d.medioPago)) {
      return NextResponse.json({ ok: false, error: "Ese medio de pago no está disponible" }, { status: 400 })
    }

    // ── Productos y precios ──
    const ids = Array.from(new Set(d.items.map((i) => i.productoId)))
    const { data: prods, error: errProds } = await admin
      .from("productos")
      .select(
        "id, nombre, marca, linea, peso_kg, imagen_url, precio, unidad, stock, controla_stock, publicado_en_landing, oferta_activa, oferta_tipo, oferta_valor, oferta_cantidad, oferta_hasta",
      )
      .eq("tenant_id", d.tenantId)
      .eq("activo", true)
      .in("id", ids)
    if (errProds) throw errProds
    const porId = new Map((prods as FilaProducto[]).map((p) => [p.id, p]))

    // Misma línea dos veces (dos pestañas): se suman.
    const cantidades = new Map<string, number>()
    for (const i of d.items) cantidades.set(i.productoId, (cantidades.get(i.productoId) ?? 0) + i.cantidad)

    const items = []
    for (const [productoId, cantidad] of cantidades) {
      const p = porId.get(productoId)
      if (!p || !p.publicado_en_landing) {
        return NextResponse.json({ ok: false, error: "Uno de los productos ya no está disponible. Revisá el carrito." }, { status: 409 })
      }
      if (!cantidadValida(p.unidad, cantidad)) {
        return NextResponse.json({ ok: false, error: `La cantidad de "${p.nombre}" no es válida` }, { status: 400 })
      }
      if (p.controla_stock && Number(p.stock) < cantidad) {
        const quedan = Math.max(0, Number(p.stock))
        return NextResponse.json(
          { ok: false, error: quedan > 0 ? `De "${p.nombre}" quedan ${quedan}` : `"${p.nombre}" está sin stock` },
          { status: 409 },
        )
      }
      const { precioUnitario, subtotal } = precioLineaWeb(
        {
          precio: Number(p.precio),
          ofertaActiva: p.oferta_activa ?? false,
          ofertaTipo: p.oferta_tipo,
          ofertaValor: p.oferta_valor,
          ofertaCantidad: p.oferta_cantidad,
          ofertaHasta: p.oferta_hasta,
        },
        cantidad,
      )
      const presentacion = p.unidad === "kg"
        ? "por kg"
        : p.peso_kg != null ? `${Number(p.peso_kg).toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg` : ""
      items.push({
        producto_id: p.id,
        nombre: [p.nombre, p.linea].filter(Boolean).join(" "),
        marca: p.marca ?? "",
        presentacion,
        imagen_url: p.imagen_url,
        unidad: p.unidad,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal,
      })
    }

    const total = items.reduce((acc, i) => acc + i.subtotal, 0)
    if (total <= 0) return NextResponse.json({ ok: false, error: "El pedido no tiene importe" }, { status: 400 })

    // ── Cliente de la veterinaria (por el email de la cuenta) ──
    const email = user.email.toLowerCase()
    const { data: existente } = await admin
      .from("clientes")
      .select("id, dni, domicilio")
      .eq("tenant_id", d.tenantId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()

    let clienteId: string
    if (existente) {
      clienteId = existente.id as string
      const cambios: Record<string, unknown> = { nombre: d.nombre, telefono: d.telefono }
      if (d.entrega === "envio") cambios.domicilio = d.direccion
      // El DNI es único por veterinaria: solo se completa si no tenía.
      if (d.dni && !existente.dni) cambios.dni = d.dni
      const { error } = await admin.from("clientes").update(cambios).eq("id", clienteId)
      if (error && error.code !== "23505") throw error
    } else {
      const fila = {
        tenant_id: d.tenantId,
        nombre: d.nombre,
        telefono: d.telefono,
        email,
        dni: d.dni || null,
        domicilio: d.entrega === "envio" ? d.direccion : null,
        historial_datos: [],
      }
      let { data: nuevo, error } = await admin.from("clientes").insert(fila).select("id").single()
      if (error?.code === "23505") {
        // Ya había un cliente con ese DNI (cargado en el mostrador): se usa ese.
        const r = await admin.from("clientes").select("id").eq("tenant_id", d.tenantId).eq("dni", d.dni).maybeSingle()
        nuevo = r.data
        error = r.error
        if (nuevo) await admin.from("clientes").update({ email, telefono: d.telefono }).eq("id", nuevo.id)
      }
      if (error || !nuevo) throw error ?? new Error("No se pudo registrar el cliente")
      clienteId = nuevo.id as string
    }

    // ── Pedido ──
    const { data: creado, error: errPedido } = await admin.rpc("crear_pedido_web", {
      p_tenant: d.tenantId,
      p_usuario_id: user.id,
      p_cliente_id: clienteId,
      p_datos: {
        cliente_nombre: d.nombre,
        cliente_telefono: d.telefono,
        cliente_email: email,
        cliente_dni: d.dni,
        entrega: d.entrega,
        direccion: d.entrega === "envio" ? d.direccion : "",
        nota: d.nota,
        medio_pago: d.medioPago,
      },
      p_items: items,
    })
    if (errPedido) throw errPedido
    const { pedido_id: pedidoId, numero } = creado as { pedido_id: string; numero: number }

    const origen = origenDe(request)
    const pedido = await cargarPedido(admin, pedidoId)
    if (!pedido) throw new Error("El pedido no se guardó")

    let pago: Awaited<ReturnType<typeof iniciarPago>> = { tipo: "ninguno" }
    let errorPago: string | null = null
    try {
      pago = await iniciarPago(admin, pedido, origen)
    } catch (e) {
      // El pedido ya existe: el cobro se puede reintentar desde su página.
      console.error("[tienda/pedidos] No se pudo iniciar el pago", pedidoId, e)
      errorPago = mensajePago(e)
    }

    if (pago.tipo === "ninguno" && !errorPago) await notificarPedido(admin, pedido, origen, "recibido")

    return NextResponse.json({ ok: true, pedidoId, numero, pago, errorPago })
  } catch (error) {
    console.error("[tienda/pedidos POST]", error)
    return NextResponse.json({ ok: false, error: "No se pudo registrar el pedido" }, { status: 500 })
  }
}

