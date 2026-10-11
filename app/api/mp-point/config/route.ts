import { NextResponse } from "next/server"
import { autorizarDueno } from "@/lib/billing/dueno"
import { getConfigPoint } from "@/lib/mp-point/auth"
import { configurarTerminalPDV, listarTerminales, MercadoPagoError } from "@/lib/mp-point/api"

/**
 * Configuración de Mercado Pago Point de una veterinaria (solo el dueño).
 *
 *  GET    ?tenantId=        → { configurado, terminalId, terminalNombre, terminales[] }
 *                             (la lista se pide en vivo a MP con el token guardado)
 *  POST   { tenantId, accessToken? , terminalId?, printOnTerminal? }
 *         - con accessToken: lo valida listando terminales y lo guarda.
 *         - con terminalId: la elige y la pone en modo PDV.
 *  DELETE { tenantId }      → borra token y terminal.
 *
 * El token nunca vuelve al cliente: ni en GET ni en POST.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenantId")
  const auth = await autorizarDueno(request, tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  try {
    const config = await getConfigPoint(auth.admin, tenantId as string)
    if (!config) return NextResponse.json({ ok: true, configurado: false, terminales: [] })

    let terminales: Awaited<ReturnType<typeof listarTerminales>> = []
    let errorToken: string | null = null
    try {
      terminales = await listarTerminales(config.accessToken)
    } catch (e) {
      errorToken = e instanceof MercadoPagoError && e.status === 401
        ? "El access token ya no es válido. Volvé a generarlo en Mercado Pago."
        : "No se pudo consultar las terminales en Mercado Pago."
    }

    return NextResponse.json({
      ok: true,
      configurado: true,
      terminalId: config.terminalId,
      terminalNombre: config.terminalNombre,
      printOnTerminal: config.printOnTerminal,
      terminales,
      errorToken,
    })
  } catch (error) {
    console.error("[mp-point/config GET]", error)
    return NextResponse.json({ ok: false, error: "No se pudo leer la configuración" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let payload: { tenantId?: string; accessToken?: string; terminalId?: string; printOnTerminal?: boolean }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const auth = await autorizarDueno(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = payload.tenantId as string

  try {
    const actual = await getConfigPoint(auth.admin, tenantId)
    const accessToken = payload.accessToken?.trim() || actual?.accessToken
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Pegá el access token de tu cuenta de Mercado Pago" }, { status: 400 })
    }

    // Validar el token (y traer las terminales) antes de guardar nada.
    let terminales
    try {
      terminales = await listarTerminales(accessToken)
    } catch (e) {
      const msg = e instanceof MercadoPagoError && (e.status === 401 || e.status === 403)
        ? "Mercado Pago rechazó el access token. Tiene que ser el token de PRODUCCIÓN de tu aplicación."
        : "No se pudo conectar con Mercado Pago. Intentá de nuevo."
      return NextResponse.json({ ok: false, error: msg }, { status: 400 })
    }

    let terminalId = payload.terminalId ?? actual?.terminalId ?? null
    let terminalNombre = actual?.terminalNombre ?? null
    if (terminalId) {
      const terminal = terminales.find((t) => t.id === terminalId)
      if (!terminal) {
        // La terminal guardada ya no está en la cuenta: se desvincula.
        terminalId = null
        terminalNombre = null
      } else {
        if (terminal.operatingMode !== "PDV") {
          await configurarTerminalPDV(accessToken, terminal.id)
        }
        terminalNombre = terminal.id.split("__")[0].replace(/_/g, " ")
      }
    } else if (terminales.length === 1) {
      // Una sola terminal: se elige solita.
      const unica = terminales[0]
      if (unica.operatingMode !== "PDV") await configurarTerminalPDV(accessToken, unica.id)
      terminalId = unica.id
      terminalNombre = unica.id.split("__")[0].replace(/_/g, " ")
    }

    const { error } = await auth.admin.from("mp_point_config").upsert({
      tenant_id: tenantId,
      access_token: accessToken,
      terminal_id: terminalId,
      terminal_nombre: terminalNombre,
      print_on_terminal: payload.printOnTerminal ?? actual?.printOnTerminal ?? true,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error

    return NextResponse.json({
      ok: true,
      configurado: true,
      terminalId,
      terminalNombre,
      terminales,
      // Si recién se pasó a PDV, la terminal tiene que reiniciarse.
      requiereReinicio: terminalId ? terminales.find((t) => t.id === terminalId)?.operatingMode !== "PDV" : false,
    })
  } catch (error) {
    console.error("[mp-point/config POST]", error)
    return NextResponse.json({ ok: false, error: "No se pudo guardar la configuración" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let payload: { tenantId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const auth = await autorizarDueno(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { error } = await auth.admin.from("mp_point_config").delete().eq("tenant_id", payload.tenantId as string)
  if (error) {
    console.error("[mp-point/config DELETE]", error)
    return NextResponse.json({ ok: false, error: "No se pudo desconectar" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
