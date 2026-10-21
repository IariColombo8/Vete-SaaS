import { NextResponse } from "next/server"
import { autorizarPedido } from "@/lib/pedidos/servidor"

/**
 * Remito y factura de un pedido, para su comprador.
 *
 * GET → { ok, venta, factura, emisor, fiscal, facturaUrl }
 *  · `venta` / `factura`: filas crudas (el navegador las mapea con los mismos
 *    helpers del panel y dibuja los PDF con el mismo generador).
 *  · `facturaUrl`: link firmado al PDF guardado de la factura, si ya existe
 *    (065_comprobantes_pdf.sql): una factura emitida se entrega siempre igual.
 *
 * Las tablas `ventas`, `comprobantes` y `tenant_fiscal` son de staff: el
 * comprador las ve solo por acá, y solo las de su pedido.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const acceso = await autorizarPedido(request, id)
    if (!acceso.ok) return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status })
    const { admin, pedido } = acceso
    if (!pedido.ventaId) return NextResponse.json({ ok: false, error: "El pedido todavía no está cobrado" }, { status: 409 })

    const [{ data: venta, error: e1 }, { data: factura }, { data: tenant }, { data: fiscal }] = await Promise.all([
      admin.from("ventas").select("*, venta_items(*), venta_pagos(*)").eq("id", pedido.ventaId).maybeSingle(),
      admin
        .from("comprobantes")
        .select("*")
        .eq("venta_id", pedido.ventaId)
        .eq("estado", "emitido")
        .in("tipo_cbte", [1, 6, 11])
        .maybeSingle(),
      admin.from("tenants").select("nombre, direccion, telefono, email, logo").eq("slug", pedido.tenantId).maybeSingle(),
      admin
        .from("tenant_fiscal")
        .select("cuit, razon_social, condicion_iva, domicilio_fiscal, ingresos_brutos, inicio_actividades")
        .eq("tenant_id", pedido.tenantId)
        .maybeSingle(),
    ])
    if (e1) throw e1
    if (!venta) return NextResponse.json({ ok: false, error: "Venta no encontrada" }, { status: 404 })

    let facturaUrl: string | null = null
    if (factura) {
      const { data } = await admin.storage
        .from("comprobantes")
        .createSignedUrl(`${pedido.tenantId}/${factura.id}.pdf`, 60 * 10)
      facturaUrl = data?.signedUrl ?? null
    }

    const inicio = fiscal?.inicio_actividades as string | null | undefined
    return NextResponse.json({
      ok: true,
      venta,
      factura: factura ?? null,
      facturaUrl,
      emisor: {
        nombre: (tenant?.nombre as string | null) || pedido.tenantId,
        direccion: (tenant?.direccion as string | null) ?? undefined,
        telefono: (tenant?.telefono as string | null) ?? undefined,
        email: (tenant?.email as string | null) ?? undefined,
        logoUrl: (tenant?.logo as string | null) ?? undefined,
      },
      fiscal: fiscal
        ? {
            cuit: String(fiscal.cuit).replace(/\D/g, ""),
            razonSocial: fiscal.razon_social,
            condicionIva: fiscal.condicion_iva,
            domicilioFiscal: fiscal.domicilio_fiscal ?? undefined,
            ingresosBrutos: fiscal.ingresos_brutos ?? undefined,
            inicioActividades: inicio ? inicio.split("-").reverse().join("/") : undefined,
          }
        : null,
    })
  } catch (error) {
    console.error("[tienda/pedidos/documentos]", error)
    return NextResponse.json({ ok: false, error: "No se pudieron cargar los documentos" }, { status: 500 })
  }
}
