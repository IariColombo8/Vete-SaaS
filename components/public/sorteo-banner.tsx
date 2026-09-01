"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Gift, Camera, UserPlus, Loader2, PartyPopper, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RegistroClienteDialog } from "@/components/turnos/RegistroClienteDialog"
import { getClienteByDNI } from "@/lib/supabase/clientes"
import { getFotoParticipacionExistente, registrarParticipacionRegistro, subirFotoParticipacion } from "@/lib/supabase/sorteos"
import { uploadFotoTenant } from "@/lib/supabase/storage"
import type { Sorteo } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  sorteo: Sorteo
}

/** Cartel de éxito compartido: se usa tanto al registrarse como al subir la foto. */
function CartelExito({ open, onOpenChange, mensaje }: { open: boolean; onOpenChange: (o: boolean) => void; mensaje: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogDescription className="sr-only">Confirmación de participación en el sorteo</DialogDescription>
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
            <PartyPopper className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <DialogTitle className="text-lg">¡Felicitaciones!</DialogTitle>
          <p className="text-sm text-muted-foreground">{mensaje}</p>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Sube la foto de la mascota para sumar la chance del sorteo: pide DNI primero
 *  para ubicar al cliente; si no existe, lo manda a registrarse antes. Si ya
 *  había subido una foto para este sorteo, avisa antes de reemplazarla. */
function DialogFoto({ tenantId, sorteo, open, onOpenChange }: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [dni, setDni] = useState("")
  const [buscando, setBuscando] = useState(false)
  const [encontrado, setEncontrado] = useState<boolean | null>(null)
  const [fotoExistente, setFotoExistente] = useState<string | null>(null)
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [exitoOpen, setExitoOpen] = useState(false)

  const reset = () => {
    setDni(""); setEncontrado(null); setFotoExistente(null); setConfirmarReemplazo(false); setFotoFile(null)
  }

  const buscar = async () => {
    if (!dni.trim()) return
    setBuscando(true)
    try {
      const cliente = await getClienteByDNI(tenantId, dni.trim())
      setEncontrado(!!cliente)
      if (cliente) {
        const foto = await getFotoParticipacionExistente(tenantId, sorteo.id, dni.trim())
        setFotoExistente(foto)
      }
    } finally {
      setBuscando(false)
    }
  }

  const enviar = async () => {
    if (!fotoFile) return
    setEnviando(true)
    try {
      const fotoUrl = await uploadFotoTenant(tenantId, "sorteos/participaciones", fotoFile)
      await subirFotoParticipacion(tenantId, sorteo.id, dni.trim(), fotoUrl)
      onOpenChange(false)
      reset()
      setExitoOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subí la foto de tu mascota</DialogTitle>
            <DialogDescription>Sumá una chance extra subiendo una foto de tu mascota en la veterinaria.</DialogDescription>
          </DialogHeader>

          {encontrado === null && (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Ingresá tu DNI para identificarte</Label>
              <Input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Tu DNI" />
              <Button className="w-full" disabled={buscando || !dni.trim()} onClick={buscar}>
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
              </Button>
            </div>
          )}

          {encontrado === false && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                No encontramos un cliente con ese DNI. Registrate primero y volvé a intentar.
              </p>
              <RegistroClienteDialog
                tenantId={tenantId}
                dniInicial={dni}
                trigger={<Button className="w-full bg-emerald-600 hover:bg-emerald-700"><UserPlus className="mr-2 h-4 w-4" /> Registrarme</Button>}
              />
              <Button variant="ghost" className="w-full" onClick={() => setEncontrado(null)}>Ya me registré, reintentar</Button>
            </div>
          )}

          {encontrado === true && fotoExistente && !confirmarReemplazo && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">Ya subiste una imagen para este sorteo.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoExistente} alt="Tu foto actual" className="mx-auto h-32 w-32 rounded-xl border object-cover" />
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmarReemplazo(true)}>
                Reemplazar imagen
              </Button>
            </div>
          )}

          {encontrado === true && (!fotoExistente || confirmarReemplazo) && (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Foto de tu mascota</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          {encontrado === true && (!fotoExistente || confirmarReemplazo) && (
            <DialogFooter>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={!fotoFile || enviando}
                onClick={enviar}
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sumar chance"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <CartelExito open={exitoOpen} onOpenChange={setExitoOpen} mensaje="Ya te inscribiste con la foto de tu mascota." />
    </>
  )
}

/** Botón "Registrate y participá": pide DNI primero. Si ya es cliente, suma
 *  la chance de esta mecánica para ESTE sorteo puntual; si no, abre el alta y
 *  felicita al terminar. Ser cliente viejo no alcanza: hay que tocar este
 *  botón en cada sorteo para participar en esa mecánica. */
function DialogRegistro({ tenantId, sorteoId }: { tenantId: string; sorteoId: string }) {
  const [checkOpen, setCheckOpen] = useState(false)
  const [dni, setDni] = useState("")
  const [buscando, setBuscando] = useState(false)
  const [yaRegistrado, setYaRegistrado] = useState<boolean | null>(null)
  const [formularioOpen, setFormularioOpen] = useState(false)
  const [exitoOpen, setExitoOpen] = useState(false)

  const reset = () => {
    setDni(""); setYaRegistrado(null)
  }

  const buscar = async () => {
    if (!dni.trim()) return
    setBuscando(true)
    try {
      const cliente = await getClienteByDNI(tenantId, dni.trim())
      if (cliente) {
        await registrarParticipacionRegistro(tenantId, sorteoId, dni.trim())
        setYaRegistrado(true)
      } else {
        setCheckOpen(false)
        setFormularioOpen(true)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar tu participación")
    } finally {
      setBuscando(false)
    }
  }

  return (
    <>
      <Button
        size="lg"
        className="rounded-full bg-white font-bold text-emerald-700 shadow-lg transition-transform duration-300 hover:scale-105 hover:bg-white/90"
        onClick={() => setCheckOpen(true)}
      >
        <UserPlus className="mr-2 h-4 w-4" /> Registrate y participá
      </Button>

      <Dialog open={checkOpen} onOpenChange={(o) => { setCheckOpen(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Participar del sorteo</DialogTitle>
            <DialogDescription>Ingresá tu DNI para verificar si ya estás registrado.</DialogDescription>
          </DialogHeader>

          {yaRegistrado === true ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">Ya estás registrado. ¡Ya estás participando del sorteo!</p>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setCheckOpen(false)}>
                Listo
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Ingresá tu DNI</Label>
              <Input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Tu DNI" />
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={buscando || !dni.trim()} onClick={buscar}>
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RegistroClienteDialog
        tenantId={tenantId}
        trigger={null}
        dniInicial={dni}
        open={formularioOpen}
        onOpenChange={setFormularioOpen}
        onExito={async () => {
          try {
            await registrarParticipacionRegistro(tenantId, sorteoId, dni.trim())
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo registrar tu participación")
          }
          reset()
          setExitoOpen(true)
        }}
      />

      <CartelExito open={exitoOpen} onOpenChange={setExitoOpen} mensaje="Ya te inscribiste para el sorteo." />
    </>
  )
}

/** Foto principal del sorteo + la de cada premio que tenga una: todas las
 *  imágenes disponibles, para que el visitante pueda verlas todas. */
function GaleriaSorteo({ sorteo }: { sorteo: Sorteo }) {
  const imagenes = [
    ...(sorteo.fotoUrl ? [{ url: sorteo.fotoUrl, alt: sorteo.nombre }] : []),
    ...sorteo.premios.filter((p) => p.fotoUrl).map((p) => ({ url: p.fotoUrl as string, alt: p.nombre })),
  ]
  const [idx, setIdx] = useState(0)
  if (imagenes.length === 0) return null

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="float-soft rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenes[idx].url}
          alt={imagenes[idx].alt}
          className="h-24 w-24 rounded-2xl object-cover shadow-xl ring-4 ring-white/30"
        />
      </div>
      {imagenes.length > 1 && (
        <div className="flex gap-1.5">
          {imagenes.map((img, i) => (
            <button
              key={i}
              type="button"
              aria-label={img.alt}
              onClick={() => setIdx(i)}
              className={`h-7 w-7 overflow-hidden rounded-md ring-2 transition-all duration-300 hover:scale-110 ${
                i === idx ? "ring-white" : "ring-white/30 opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Días que faltan hasta `hasta` (inclusive), o "Último día" / "Cierra hoy". */
function textoCuentaRegresiva(hasta: string): string {
  const fin = new Date(`${hasta}T23:59:59`)
  const dias = Math.ceil((fin.getTime() - Date.now()) / 86_400_000)
  if (dias <= 0) return "¡Cierra hoy!"
  if (dias === 1) return "¡Último día!"
  return `Quedan ${dias} días`
}

export function SorteoBanner({ tenantId, sorteo }: Props) {
  const [dialogFotoOpen, setDialogFotoOpen] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <section id="sorteo-activo" className="relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 py-10 scroll-mt-20">
      {/* Blobs animados: mismo lenguaje visual que el hero, en verde. */}
      <div className="vet-blob vet-blob-1 opacity-60" />
      <div className="vet-blob vet-blob-2 opacity-50" />
      <div className="vet-blob vet-blob-3 opacity-40" />
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
        backgroundSize: "32px 32px",
      }} />

      <div
        className="container relative mx-auto max-w-5xl px-6"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(24px) scale(0.98)",
          transition: "opacity 0.9s cubic-bezier(.16,1,.3,1), transform 0.9s cubic-bezier(.16,1,.3,1)",
        }}
      >
        <div className="flex flex-col items-center gap-5 text-center text-white sm:flex-row sm:gap-6 sm:text-left">
          <GaleriaSorteo sorteo={sorteo} />
          <div className="flex-1">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 backdrop-blur-md">
              <Gift className="h-3.5 w-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Sorteo activo</span>
            </div>
            <h2 className="text-xl font-black sm:text-2xl">{sorteo.nombre}</h2>
            {sorteo.descripcion && <p className="mt-1 text-sm text-white/90">{sorteo.descripcion}</p>}
            {sorteo.premios.length > 0 && (
              <p className="mt-1 text-xs font-medium text-white/80">
                Premios: {sorteo.premios.map((p) => p.nombre).join(" · ")}
              </p>
            )}
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-lg shadow-orange-900/20 animate-pulse">
              {textoCuentaRegresiva(sorteo.hasta)}
            </span>

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              <DialogRegistro tenantId={tenantId} sorteoId={sorteo.id} />
              {sorteo.mecanicas.foto && (
                <Button
                  size="lg" variant="outline"
                  className="rounded-full border-white/60 bg-white/10 font-bold text-white backdrop-blur-md transition-transform duration-300 hover:scale-105 hover:bg-white/20"
                  onClick={() => setDialogFotoOpen(true)}
                >
                  <Camera className="mr-2 h-4 w-4" /> Subí la foto de tu mascota
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <DialogFoto tenantId={tenantId} sorteo={sorteo} open={dialogFotoOpen} onOpenChange={setDialogFotoOpen} />
    </section>
  )
}

/**
 * Botón flotante fijo (sigue el scroll) al costado de la pantalla, que
 * anuncia que hay un sorteo activo y lleva, con un click, al banner completo
 * (`SorteoBanner`) en el home — el detalle, premios y botones de
 * participación viven ahí. Se puede cerrar con la ✕: vuelve a aparecer si se
 * recarga la página (no se guarda en ningún lado, es solo estado de React).
 */
export function SorteoTeaser({ tenantId, sorteo }: { tenantId: string; sorteo: Sorteo }) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null

  return (
    <div className="fixed right-3 top-1/2 z-40 -translate-y-1/2 sm:right-6">
      <button
        type="button"
        aria-label="Ocultar aviso de sorteo"
        onClick={(e) => { e.preventDefault(); setVisible(false) }}
        className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white
                   shadow-md transition-colors hover:bg-slate-900 sm:-left-3 sm:-top-3 sm:h-7 sm:w-7"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <a
        href={`/${tenantId}#sorteo-activo`}
        aria-label={`Sorteo activo: ${sorteo.nombre}. Ir a participar`}
        className="group flex flex-col items-center gap-2 sm:gap-3.5 rounded-2xl sm:rounded-3xl
                   bg-gradient-to-b from-emerald-600 via-emerald-500 to-teal-500 px-2.5 py-4 sm:px-7 sm:py-11 shadow-xl shadow-emerald-500/30
                   transition-transform duration-300 hover:scale-110 sm:hover:scale-105"
        style={{ animation: "softFloat 3s ease-in-out infinite" }}
      >
        <span className="absolute inset-0 rounded-2xl sm:rounded-3xl overflow-hidden">
          <span className="absolute inset-0 -translate-y-full bg-gradient-to-b from-transparent via-white/30 to-transparent
                            transition-transform duration-1000 group-hover:translate-y-full" />
        </span>
        <Gift className="h-5 w-5 sm:h-12 sm:w-12 text-white" />
        <span className="max-w-[1.1rem] sm:max-w-none sm:text-lg text-center text-[11px] font-bold leading-tight text-white [writing-mode:vertical-rl]">
          Sorteo activo
        </span>
        <Sparkles className="h-3.5 w-3.5 sm:h-8 sm:w-8 text-white" />
      </a>
    </div>
  )
}
