import { NextResponse } from "next/server"
import { z } from "zod"
import { supabase } from "@/lib/supabase/config"

/**
 * Proxy server-side de `buscar_cliente_global_publico`: la RPC busca por DNI
 * en TODOS los tenants (reconocimiento de cliente entre veterinarias, ver
 * lib/supabase/clientes.ts), así que expone PII con solo un DNI de 7-8
 * dígitos. Antes se llamaba directo desde el navegador con la clave anon, sin
 * ningún límite — un script podía enumerar DNIs sin fricción. Esta ruta le
 * pone un límite de intentos por IP antes de pegarle a la RPC.
 */

const bodySchema = z.object({ dni: z.string().trim().min(1).max(20) })

const VENTANA_MS = 60_000
const MAX_INTENTOS = 8

// Best-effort: vive en memoria del proceso, se resetea en cold start. No
// protege contra un atacante distribuido, pero frena la enumeración simple
// sin agregar infraestructura nueva (Redis/Upstash) para un endpoint de bajo
// tráfico real.
const intentosPorIp = new Map<string, number[]>()

function estaLimitada(ip: string): boolean {
  const ahora = Date.now()
  const previos = (intentosPorIp.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS)
  previos.push(ahora)
  intentosPorIp.set(ip, previos)
  return previos.length > MAX_INTENTOS
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida"

  if (estaLimitada(ip)) {
    return NextResponse.json(
      { ok: false, error: "Demasiados intentos. Probá de nuevo en un minuto." },
      { status: 429 },
    )
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "DNI inválido" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("buscar_cliente_global_publico", { p_dni: parsed.data.dni })
  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo buscar el cliente" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: data ?? null })
}
