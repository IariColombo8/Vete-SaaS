# Historia clínica pública por DNI + perfil de mascota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un visitante sin sesión busca su DNI en `/[slug]/mi-historia`, ve sus mascotas, entra al perfil de cada una (`/[slug]/mi-historia/[mascotaId]`) con historia clínica completa, todos sus turnos, y puede subirle una foto opcional que se usa como fondo del perfil.

**Architecture:** Se extiende el patrón `_publico` de RPCs `security definer` ya usado en `supabase/020_clientes_publico.sql` (bypassan RLS validando `tenant_id` a mano) para exponer `historias`, `turnos` y una mascota puntual sin sesión. La foto se sube vía un API route server-side (`app/api/mascota-foto/route.ts`) que valida ownership (DNI → mascota) con el cliente anon y recién entonces escribe con `getAdminDb()` (service_role, ya existe en `lib/supabase/admin.ts`), evitando relajar la policy de Storage.

**Tech Stack:** Next.js 16 App Router (client components), Supabase (Postgres RPC + Storage + `@supabase/supabase-js` admin client), shadcn/ui, Tailwind v4, Vitest.

---

## Task 1: Migración SQL — RPCs públicas de historias/turnos/mascota + columna `foto_url`

**Files:**
- Create: `supabase/021_historia_publica.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- ============================================================================
-- 021 — Historia clínica pública por DNI + perfil de mascota
--
-- Bug/feature: un visitante sin sesión no puede ver la historia clínica ni
-- los turnos de su mascota (RLS de `historias`/`turnos` solo deja pasar a
-- staff o al dueño autenticado por email, ver policies en schema.sql). Estas
-- funciones siguen el mismo patrón `security definer` que
-- 020_clientes_publico.sql: corren con los privilegios del dueño de la
-- función, no los del caller, y validan `tenant_id` a mano para no filtrar
-- datos de otro tenant.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- foto_url: fondo de perfil opcional de la mascota, la sube el propio
-- visitante vía app/api/mascota-foto (con validación de ownership por DNI).
-- ----------------------------------------------------------------------------
alter table public.mascotas add column if not exists foto_url text;

-- ----------------------------------------------------------------------------
-- obtener_mascota_publico: una mascota puntual, para /mi-historia/[mascotaId].
-- Devuelve cliente_id para que la página pueda pedir los turnos del dueño.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_mascota_publico(
  p_tenant text,
  p_mascota_id uuid
)
returns public.mascotas
language sql
stable
security definer
set search_path = public
as $$
  select * from public.mascotas
  where tenant_id = p_tenant and id = p_mascota_id
$$;

grant execute on function public.obtener_mascota_publico(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_historias_publico: historias de una mascota, valida que sea del
-- tenant. Mismo orden que getHistorias() (fecha desc).
-- ----------------------------------------------------------------------------
create or replace function public.obtener_historias_publico(
  p_tenant text,
  p_mascota_id uuid
)
returns setof public.historias
language sql
stable
security definer
set search_path = public
as $$
  select h.* from public.historias h
  join public.mascotas m on m.id = h.mascota_id
  where m.tenant_id = p_tenant and h.mascota_id = p_mascota_id
  order by h.fecha_atencion desc
$$;

grant execute on function public.obtener_historias_publico(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_turnos_publico: turnos de un cliente, valida que sea del tenant.
-- La página de perfil filtra en el cliente por mascota_id.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_turnos_publico(
  p_tenant text,
  p_cliente_id uuid
)
returns setof public.turnos
language sql
stable
security definer
set search_path = public
as $$
  select t.* from public.turnos t
  where t.tenant_id = p_tenant and t.cliente_id = p_cliente_id
  order by t.fecha desc, t.hora desc
$$;

grant execute on function public.obtener_turnos_publico(text, uuid) to anon, authenticated;
```

- [ ] **Step 2: Ejecutar la migración en Supabase**

Abrir el proyecto en el Supabase Dashboard → SQL Editor → pegar el contenido
completo de `supabase/021_historia_publica.sql` → Run. Verificar que no tira
error (es idempotente, se puede volver a correr sin romper nada).

- [ ] **Step 3: Commit**

```bash
git add supabase/021_historia_publica.sql
git commit -m "feat(supabase): agregar RPCs publicas de historias/turnos y foto_url en mascotas"
```

---

## Task 2: Tipos — `Mascota.fotoUrl` y `Mascota.clienteId`

**Files:**
- Modify: `lib/supabase/types.ts:153-167`

- [ ] **Step 1: Agregar los campos a la interfaz `Mascota`**

En `lib/supabase/types.ts`, reemplazar el bloque de la interfaz `Mascota`:

```typescript
export interface Mascota {
  id?: string
  /** Dueño de la mascota. Solo viene poblado desde obtener_mascota_publico(). */
  clienteId?: string
  nombre: string
  tipo: string
  edad?: string
  /** Valor numérico de la edad tal como se cargó (ver edadUnidad/edadRegistradaEn). */
  edadValor?: number
  edadUnidad?: "meses" | "anios"
  /** Fecha (YYYY-MM-DD) en la que se cargó edadValor/edadUnidad. */
  edadRegistradaEn?: string
  raza?: string
  peso?: string
  /** Token aleatorio para la libreta pública por QR (no adivinable). */
  libretaToken?: string
  /** Foto opcional subida por el dueño; fondo del perfil público. */
  fotoUrl?: string
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (los campos son opcionales, no rompen a nadie
que arme un `Mascota` sin ellos).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat(types): agregar fotoUrl y clienteId opcionales a Mascota"
```

---

## Task 3: `lib/supabase/mascotas.ts` — mapear `fotoUrl`/`clienteId` y agregar `getMascotaPublico`

**Files:**
- Modify: `lib/supabase/mascotas.ts:12-34` (función `aMascota`)
- Modify: `lib/supabase/mascotas.ts` (agregar función nueva al final)

- [ ] **Step 1: Actualizar `aMascota` para incluir los campos nuevos**

En `lib/supabase/mascotas.ts`, reemplazar el `return` de `aMascota`:

```typescript
export function aMascota(f: Fila): Mascota {
  const edadValor = f.edad_valor != null ? Number(f.edad_valor) : undefined
  const edadUnidad = (f.edad_unidad as Mascota["edadUnidad"]) ?? undefined
  const edadRegistradaEn = (f.edad_registrada_en as string) ?? undefined

  const edadCalculada =
    edadValor !== undefined && edadUnidad && edadRegistradaEn
      ? calcularEdadActual({ valor: edadValor, unidad: edadUnidad, registradaEn: edadRegistradaEn })
      : null

  return {
    id: f.id as string,
    clienteId: (f.cliente_id as string) ?? undefined,
    nombre: (f.nombre as string) ?? "",
    tipo: (f.tipo as string) ?? "",
    edad: edadCalculada ? formatearEdad(edadCalculada) : (f.edad as string) ?? undefined,
    edadValor,
    edadUnidad,
    edadRegistradaEn,
    raza: (f.raza as string) ?? undefined,
    peso: (f.peso as string) ?? undefined,
    libretaToken: (f.libreta_token as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
  }
}
```

- [ ] **Step 2: Agregar `getMascotaPublico` al final del archivo**

```typescript
/** Una mascota puntual, sin sesión (para /mi-historia/[mascotaId]). */
export async function getMascotaPublico(
  tenantId: string,
  mascotaId: string,
): Promise<Mascota | null> {
  const { data } = await supabase
    .rpc("obtener_mascota_publico", { p_tenant: tenantId, p_mascota_id: mascotaId })
  const fila = Array.isArray(data) ? data[0] : data
  return fila ? aMascota(fila) : null
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/mascotas.ts
git commit -m "feat(mascotas): mapear fotoUrl/clienteId y agregar getMascotaPublico"
```

---

## Task 4: `lib/supabase/historias.ts` — agregar `getHistoriasPublico`

**Files:**
- Modify: `lib/supabase/historias.ts` (agregar función nueva, cerca de `getHistorias`)

- [ ] **Step 1: Agregar la función después de `getHistorias` (línea ~135)**

```typescript
/** Historias de una mascota, sin sesión (para /mi-historia/[mascotaId]). */
export async function getHistoriasPublico(
  tenantId: string,
  mascotaId: string,
): Promise<Historia[]> {
  const { data } = await supabase
    .rpc("obtener_historias_publico", { p_tenant: tenantId, p_mascota_id: mascotaId })
  return (data ?? []).map(aHistoria)
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/historias.ts
git commit -m "feat(historias): agregar getHistoriasPublico"
```

---

## Task 5: `lib/supabase/turnos.ts` — agregar `getTurnosPublico`

**Files:**
- Modify: `lib/supabase/turnos.ts` (agregar función nueva, cerca de `getTurnosByClienteEmail`, línea ~223)

- [ ] **Step 1: Agregar la función después de `getTurnosByClienteEmail`**

```typescript
/** Turnos de un cliente, sin sesión (para /mi-historia/[mascotaId]). */
export async function getTurnosPublico(
  tenantId: string,
  clienteId: string,
): Promise<Turno[]> {
  if (!clienteId) return []
  const { data } = await supabase
    .rpc("obtener_turnos_publico", { p_tenant: tenantId, p_cliente_id: clienteId })
  return (data ?? []).map(aTurno)
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (`aTurno` ya está definida en el mismo archivo, no
hace falta exportarla).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/turnos.ts
git commit -m "feat(turnos): agregar getTurnosPublico"
```

---

## Task 6: API route — subir foto de mascota con validación de ownership

**Files:**
- Create: `app/api/mascota-foto/route.ts`

- [ ] **Step 1: Escribir el route completo**

```typescript
import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/config"
import { getAdminDb } from "@/lib/supabase/admin"
import { BUCKET } from "@/lib/supabase/config"

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Sube la foto de perfil de una mascota sin requerir sesión.
 *
 * El visitante no está autenticado, así que el ownership se valida a mano:
 * el DNI que manda tiene que corresponder a un cliente que sea dueño de esa
 * mascota (mismo patrón de verificación que ya hace guardar_cliente_publico
 * del lado de la base). Recién ahí se escribe con la service_role key,
 * porque la policy de Storage (storage_write) solo permite `insert` a staff.
 */
export async function POST(request: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Supabase Admin no configurado en el servidor" },
      { status: 503 },
    )
  }

  const form = await request.formData()
  const tenantId = form.get("tenantId")
  const dni = form.get("dni")
  const mascotaId = form.get("mascotaId")
  const foto = form.get("foto")

  if (
    typeof tenantId !== "string" || !tenantId ||
    typeof dni !== "string" || !dni.trim() ||
    typeof mascotaId !== "string" || !mascotaId ||
    !(foto instanceof File)
  ) {
    return NextResponse.json({ ok: false, error: "Faltan datos" }, { status: 400 })
  }

  if (!foto.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "El archivo tiene que ser una imagen" }, { status: 400 })
  }
  if (foto.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "La imagen no puede pesar más de 5MB" }, { status: 400 })
  }

  // Ownership: el DNI tiene que pertenecer a un cliente de este tenant, y
  // esa mascota tiene que ser suya.
  const { data: cliente } = await supabase
    .rpc("buscar_cliente_publico", { p_tenant: tenantId, p_dni: dni.trim() })
  const clienteFila = Array.isArray(cliente) ? cliente[0] : cliente
  if (!clienteFila) {
    return NextResponse.json({ ok: false, error: "No encontramos un cliente con ese DNI" }, { status: 404 })
  }

  const { data: mascotas } = await supabase
    .rpc("obtener_mascotas_publico", { p_tenant: tenantId, p_cliente_id: clienteFila.id })
  const esDueño = (mascotas ?? []).some((m: { id: string }) => m.id === mascotaId)
  if (!esDueño) {
    return NextResponse.json({ ok: false, error: "Ese DNI no corresponde a esta mascota" }, { status: 403 })
  }

  const ext = (foto.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
  const path = `${tenantId}/mascotas/${mascotaId}/foto-${Date.now()}.${ext}`
  const buffer = Buffer.from(await foto.arrayBuffer())

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: foto.type,
    cacheControl: "3600",
    upsert: false,
  })
  if (uploadError) {
    console.error("[mascota-foto] Error subiendo:", uploadError.message)
    return NextResponse.json({ ok: false, error: "No se pudo subir la foto" }, { status: 500 })
  }

  const fotoUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error: updateError } = await admin
    .from("mascotas")
    .update({ foto_url: fotoUrl })
    .eq("id", mascotaId)
    .eq("tenant_id", tenantId)
  if (updateError) {
    console.error("[mascota-foto] Error actualizando mascota:", updateError.message)
    return NextResponse.json({ ok: false, error: "No se pudo guardar la foto" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fotoUrl })
}
```

- [ ] **Step 2: Probar manualmente con curl (reemplazar valores reales de un tenant/DNI/mascota de prueba)**

```bash
curl -X POST http://localhost:3000/api/mascota-foto \
  -F "tenantId=demo" \
  -F "dni=30123456" \
  -F "mascotaId=<uuid-real-de-una-mascota-de-ese-dni>" \
  -F "foto=@./algun-archivo.jpg"
```

Expected: `{"ok":true,"fotoUrl":"https://...supabase.co/storage/v1/object/public/veterinarias/..."}`
con `npm run dev` corriendo. Probar también con un `mascotaId` que no sea de
ese DNI y confirmar que responde 403.

- [ ] **Step 3: Commit**

```bash
git add app/api/mascota-foto/route.ts
git commit -m "feat(api): endpoint publico para subir foto de mascota con validacion de ownership"
```

---

## Task 7: Componente `MascotaFotoUploader`

**Files:**
- Create: `components/turnos/MascotaFotoUploader.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Camera, Loader2 } from "lucide-react"

interface MascotaFotoUploaderProps {
  tenantId: string
  mascotaId: string
  onFotoSubida: (url: string) => void
}

export function MascotaFotoUploader({ tenantId, mascotaId, onFotoSubida }: MascotaFotoUploaderProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archivoElegido, setArchivoElegido] = useState<File | null>(null)
  const [dni, setDni] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleArchivoElegido = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivoElegido(file)
    setError(null)
    setDialogOpen(true)
  }

  const handleConfirmar = async () => {
    if (!archivoElegido || !dni.trim()) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("tenantId", tenantId)
      form.append("dni", dni.trim())
      form.append("mascotaId", mascotaId)
      form.append("foto", archivoElegido)

      const res = await fetch("/api/mascota-foto", { method: "POST", body: form })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        setError(json.error || "No se pudo subir la foto")
        return
      }

      onFotoSubida(json.fotoUrl)
      toast({ title: "¡Foto actualizada!", description: "El perfil ya se ve con la nueva foto." })
      setDialogOpen(false)
      setArchivoElegido(null)
      setDni("")
    } catch {
      setError("No pudimos subir la foto. Intentá de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleArchivoElegido}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="mr-1.5 h-4 w-4" />
        Cambiar foto
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!loading) { setDialogOpen(v); if (!v) setArchivoElegido(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmá tu DNI</DialogTitle>
            <DialogDescription>
              Para subir la foto necesitamos verificar que la mascota es tuya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="foto-dni">DNI</Label>
            <Input
              id="foto-dni"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="30123456"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleConfirmar} disabled={loading || !dni.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Subir foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/turnos/MascotaFotoUploader.tsx
git commit -m "feat(turnos): agregar MascotaFotoUploader"
```

---

## Task 8: Página `/[slug]/mi-historia` — buscador por DNI

**Files:**
- Create: `app/[slug]/mi-historia/page.tsx`

- [ ] **Step 1: Escribir la página**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RegistroClienteDialog } from "@/components/turnos/RegistroClienteDialog"
import { getClienteByDNI } from "@/lib/supabase/clientes"
import { getMascotas } from "@/lib/supabase/mascotas"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import type { Cliente, Mascota } from "@/lib/supabase/types"
import { Search, Loader2, PawPrint, CalendarPlus } from "lucide-react"

function emojiPorTipo(tipo: string): string {
  return MASCOTAS_DEFAULT.find((m) => m.id === tipo)?.emoji ?? "🐾"
}

export default function MiHistoriaPage() {
  const slug = useSlug()
  const router = useRouter()
  const [dni, setDni] = useState("")
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [mascotas, setMascotas] = useState<Mascota[]>([])

  const buscar = async () => {
    if (!dni.trim()) return
    setLoading(true)
    setBuscado(false)
    try {
      const encontrado = await getClienteByDNI(slug, dni.trim())
      setCliente(encontrado)
      if (encontrado?.id) {
        const misMascotas = await getMascotas(slug, encontrado.id)
        setMascotas(misMascotas)
      } else {
        setMascotas([])
      }
    } finally {
      setLoading(false)
      setBuscado(true)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 py-8 md:py-16">
      <div className="container max-w-3xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <PawPrint className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
            Historia clínica de mi mascota
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ingresá tu DNI para ver los datos de tus mascotas.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-end gap-3">
            <div className="w-full space-y-1.5">
              <Label htmlFor="buscar-dni">DNI</Label>
              <Input
                id="buscar-dni"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder="30123456"
              />
            </div>
            <Button onClick={buscar} disabled={loading || !dni.trim()} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar
            </Button>
          </CardContent>
        </Card>

        {buscado && !cliente && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No encontramos datos con ese DNI.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => router.push(`/${slug}/turno`)} className="bg-emerald-600 hover:bg-emerald-700">
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Sacar turno
                </Button>
                <RegistroClienteDialog tenantId={slug} />
              </div>
            </CardContent>
          </Card>
        )}

        {buscado && cliente && mascotas.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Hola {cliente.nombre.split(" ")[0]}, todavía no cargaste mascotas.
            </CardContent>
          </Card>
        )}

        {buscado && cliente && mascotas.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Hola {cliente.nombre.split(" ")[0]}, elegí una mascota:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {mascotas.map((mascota) => (
                <Card
                  key={mascota.id}
                  className="hover:border-emerald-400 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => router.push(`/${slug}/mi-historia/${mascota.id}`)}
                >
                  <div
                    className="h-24 bg-cover bg-center flex items-center justify-center text-4xl"
                    style={
                      mascota.fotoUrl
                        ? { backgroundImage: `url(${mascota.fotoUrl})` }
                        : { background: "linear-gradient(135deg, #10b981, #0d9488)" }
                    }
                  >
                    {!mascota.fotoUrl && emojiPorTipo(mascota.tipo)}
                  </div>
                  <CardContent className="p-4">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{mascota.nombre}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mascota.raza || mascota.tipo}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Probar manualmente**

Con `npm run dev` corriendo, abrir `http://localhost:3000/<slug-de-un-tenant-demo>/mi-historia`,
buscar un DNI que exista en los seeds (`supabase/seeds/`) y confirmar que
aparecen las mascotas. Buscar un DNI inventado y confirmar que aparece el
mensaje de "no encontrado" con los dos botones.

- [ ] **Step 4: Commit**

```bash
git add app/[slug]/mi-historia/page.tsx
git commit -m "feat(mi-historia): agregar buscador de mascotas por DNI"
```

---

## Task 9: Página `/[slug]/mi-historia/[mascotaId]` — perfil de la mascota

**Files:**
- Create: `app/[slug]/mi-historia/[mascotaId]/page.tsx`

- [ ] **Step 1: Escribir la página**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MascotaFotoUploader } from "@/components/turnos/MascotaFotoUploader"
import { getMascotaPublico } from "@/lib/supabase/mascotas"
import { getHistoriasPublico } from "@/lib/supabase/historias"
import { getTurnosPublico } from "@/lib/supabase/turnos"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import type { Mascota, Historia, Turno } from "@/lib/supabase/types"
import { ArrowLeft, Loader2, Calendar, Clock, Stethoscope } from "lucide-react"

function emojiPorTipo(tipo: string): string {
  return MASCOTAS_DEFAULT.find((m) => m.id === tipo)?.emoji ?? "🐾"
}

const ESTADO_BADGE: Record<Turno["estado"], string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0",
  confirmado: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-0",
  completado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-0",
  cancelado: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-0",
}

function formatFecha(fecha: string): string {
  if (!fecha) return "—"
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

export default function PerfilMascotaPage() {
  const slug = useSlug()
  const router = useRouter()
  const params = useParams<{ mascotaId: string }>()
  const mascotaId = params.mascotaId

  const [loading, setLoading] = useState(true)
  const [mascota, setMascota] = useState<Mascota | null>(null)
  const [historias, setHistorias] = useState<Historia[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setLoading(true)
      const encontrada = await getMascotaPublico(slug, mascotaId)
      if (cancelado) return
      setMascota(encontrada)

      if (encontrada) {
        const [misHistorias, misTurnos] = await Promise.all([
          getHistoriasPublico(slug, mascotaId),
          encontrada.clienteId ? getTurnosPublico(slug, encontrada.clienteId) : Promise.resolve([]),
        ])
        if (cancelado) return
        setHistorias(misHistorias.filter((h) => h.tipoVisita !== "turno_programado"))
        setTurnos(misTurnos.filter((t) => t.mascotaId === mascotaId))
      }
      setLoading(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [slug, mascotaId])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (!mascota) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">No encontramos esa mascota.</p>
            <Button variant="outline" onClick={() => router.push(`/${slug}/mi-historia`)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a buscar
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 pb-16">
      {/* Banner */}
      <div
        className="relative h-56 sm:h-72 bg-cover bg-center flex items-end"
        style={
          mascota.fotoUrl
            ? { backgroundImage: `url(${mascota.fotoUrl})` }
            : { background: "linear-gradient(135deg, #10b981, #0d9488)" }
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <button
          type="button"
          onClick={() => router.push(`/${slug}/mi-historia`)}
          className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="absolute top-4 right-4 z-10">
          <MascotaFotoUploader
            tenantId={slug}
            mascotaId={mascotaId}
            onFotoSubida={(url) => setMascota((prev) => (prev ? { ...prev, fotoUrl: url } : prev))}
          />
        </div>

        {!mascota.fotoUrl && (
          <span className="absolute inset-0 flex items-center justify-center text-7xl opacity-90">
            {emojiPorTipo(mascota.tipo)}
          </span>
        )}

        <div className="relative z-10 p-6 sm:p-8">
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">{mascota.nombre}</h1>
          <p className="text-sm sm:text-base text-white/80 mt-1">
            {[mascota.tipo, mascota.raza, mascota.edad].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="container max-w-3xl px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* Historia clínica */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Historia clínica</h2>
          </div>
          {historias.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay historia clínica cargada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historias.map((h) => (
                <Card key={h.id}>
                  <CardContent className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {h.motivo || "Consulta"}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatFecha(h.fechaAtencion)}
                      </span>
                    </div>
                    {h.diagnostico && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        <strong>Diagnóstico:</strong> {h.diagnostico}
                      </p>
                    )}
                    {h.tratamiento && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        <strong>Tratamiento:</strong> {h.tratamiento}
                      </p>
                    )}
                    {h.observaciones && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{h.observaciones}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Turnos */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Turnos</h2>
          </div>
          {turnos.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Todavía no sacó turnos.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {turnos.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t.servicio || "Consulta"}
                      </span>
                      <Badge className={ESTADO_BADGE[t.estado]}>{t.estado}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatFecha(t.fecha ?? "")}</span>
                      <Clock className="h-3.5 w-3.5 ml-2" />
                      <span>{t.hora ?? "—"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Probar manualmente**

Desde `/[slug]/mi-historia`, entrar a una mascota con historias y turnos
cargados (datos de `supabase/seeds/`) y confirmar que:
- El banner muestra el emoji placeholder si no hay foto.
- "Cambiar foto" abre el selector de archivo, pide el DNI, y al confirmar
  actualiza el banner sin recargar la página.
- La sección de historia clínica y turnos muestra los datos correctos,
  ordenados por fecha descendente.
- Con un `mascotaId` inexistente en la URL, se ve la pantalla de "no
  encontramos esa mascota".

- [ ] **Step 4: Commit**

```bash
git add "app/[slug]/mi-historia/[mascotaId]/page.tsx"
git commit -m "feat(mi-historia): agregar perfil publico de mascota con historia, turnos y foto"
```

---

## Task 10: Botón nuevo en el landing

**Files:**
- Modify: `app/[slug]/vet-public-view.tsx:436-458`

- [ ] **Step 1: Agregar el import del ícono y del router (ya existe `router` en el archivo — verificar antes de duplicar)**

Confirmar que el archivo ya importa `PawPrint` o agregarlo al import de
`lucide-react` existente (buscar la línea `import { ... } from "lucide-react"`
cerca del inicio del archivo y agregar `PawPrint` a la lista).

- [ ] **Step 2: Agregar el tercer botón dentro del bloque de CTAs**

Reemplazar:

```tsx
            <RegistroClienteDialog tenantId={slug} />
          </div>
        </div>
```

por:

```tsx
            <RegistroClienteDialog tenantId={slug} />

            <Button
              size="lg"
              variant="ghost"
              className="text-white/80 hover:text-white hover:bg-white/10 font-semibold text-base h-14 px-6 rounded-full
                         transition-all duration-300"
              onClick={() => router.push(`/${slug}/mi-historia`)}
            >
              <PawPrint className="mr-2 h-5 w-5" />
              Historia clínica de mi mascota
            </Button>
          </div>
        </div>
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probar manualmente**

`npm run dev`, abrir `/<slug-de-un-tenant-demo>`, confirmar que aparece el
tercer botón debajo/al lado de los otros dos y que navega a `/mi-historia`.

- [ ] **Step 5: Commit**

```bash
git add app/[slug]/vet-public-view.tsx
git commit -m "feat(landing): agregar boton de historia clinica de mi mascota"
```

---

## Task 11: Verificación final

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errores (warnings preexistentes del proyecto son aceptables, no
introducir warnings nuevos en los archivos tocados).

- [ ] **Step 3: Tests**

Run: `npm run test`
Expected: todos los tests existentes siguen pasando (no se tocó código con
tests unitarios; esta feature no agrega tests nuevos por spec — es UI +
RPCs sin lógica pura para testear, ver sección "Testing" del spec).

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores de TypeScript ni de rutas.
