"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { createCliente, getClienteByDNI, getClienteGlobalPorDNI } from "@/lib/supabase/clientes"
import { createMascota, getMascotas } from "@/lib/supabase/mascotas"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { UserPlus, PlusCircle, Trash2, Loader2, PartyPopper, Sparkles } from "lucide-react"

interface RegistroClienteDialogProps {
  tenantId: string
  trigger?: ReactNode
  /** DNI con el que abrir el formulario ya cargado (ej: viene de un chequeo previo). */
  dniInicial?: string
  /** Se llama además del toast, al terminar de registrar con éxito. */
  onExito?: () => void
  /** Dialog controlado desde afuera (ej: para abrirlo sin pasar por el trigger). Si no se pasa, maneja su propio estado. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface MascotaBorrador {
  nombre: string
  tipo: string
  raza: string
}

type Paso = "dni" | "formulario"
type Reconocimiento = "ninguno" | "local" | "global"

const CLIENTE_VACIO = { nombre: "", telefono: "", email: "", dni: "", domicilio: "" }
const MASCOTA_VACIA: MascotaBorrador = { nombre: "", tipo: "perro", raza: "" }

export function RegistroClienteDialog({
  tenantId, trigger, dniInicial, onExito, open: openControlado, onOpenChange: onOpenChangeControlado,
}: RegistroClienteDialogProps) {
  const { toast } = useToast()
  const [openInterno, setOpenInterno] = useState(false)
  const open = openControlado ?? openInterno
  const setOpen = onOpenChangeControlado ?? setOpenInterno
  const [loading, setLoading] = useState(false)
  const [paso, setPaso] = useState<Paso>("dni")
  const [dni, setDni] = useState(dniInicial ?? "")
  const [buscando, setBuscando] = useState(false)
  const [reconocimiento, setReconocimiento] = useState<Reconocimiento>("ninguno")
  const [cliente, setCliente] = useState(CLIENTE_VACIO)
  const [mascotas, setMascotas] = useState<MascotaBorrador[]>([])

  const resetear = () => {
    setPaso("dni")
    setDni(dniInicial ?? "")
    setReconocimiento("ninguno")
    setCliente(CLIENTE_VACIO)
    setMascotas([])
  }

  useEffect(() => {
    if (open) setDni(dniInicial ?? "")
  }, [open, dniInicial])

  /**
   * Al confirmar el DNI: primero busca si ya es cliente DE ESTA veterinaria
   * (te "recuerda" con sus mascotas y todo, para revisar/actualizar). Si no,
   * busca si es cliente de OTRA veterinaria en VetPanel y solo sugiere
   * contacto + mascotas para autocompletar el alta nueva. Nunca se dispara
   * solo — únicamente al confirmar este paso.
   */
  const continuar = async () => {
    const dniLimpio = dni.trim()
    if (!dniLimpio) return
    setBuscando(true)
    try {
      const local = await getClienteByDNI(tenantId, dniLimpio)
      if (local?.id) {
        const mascotasLocales = await getMascotas(tenantId, local.id)
        setCliente({
          nombre: local.nombre, telefono: local.telefono, email: local.email,
          domicilio: local.domicilio ?? "", dni: dniLimpio,
        })
        setMascotas(mascotasLocales.map((m) => ({ nombre: m.nombre, tipo: m.tipo, raza: m.raza ?? "" })))
        setReconocimiento("local")
        setPaso("formulario")
        return
      }

      const global = await getClienteGlobalPorDNI(dniLimpio)
      if (global) {
        setCliente({
          nombre: global.nombre, telefono: global.telefono, email: global.email,
          domicilio: global.domicilio, dni: dniLimpio,
        })
        setMascotas(global.mascotas.map((m) => ({ nombre: m.nombre, tipo: m.tipo, raza: m.raza ?? "" })))
        setReconocimiento("global")
      } else {
        setCliente({ ...CLIENTE_VACIO, dni: dniLimpio })
        setMascotas([])
        setReconocimiento("ninguno")
      }
      setPaso("formulario")
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    if (open && dniInicial) continuar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dniInicial])

  const actualizarMascota = (i: number, campo: keyof MascotaBorrador, valor: string) => {
    setMascotas((prev) => prev.map((m, idx) => (idx === i ? { ...m, [campo]: valor } : m)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cliente.nombre.trim()) {
      toast({ title: "Falta tu nombre", description: "Contanos como te llamas para registrarte.", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const clienteCreado = await createCliente(tenantId, cliente)

      // Best-effort: si falla una mascota puntual no queremos que el
      // registro del cliente (lo que importa para el sorteo) se pierda.
      let mascotasConError = 0
      for (const m of mascotas) {
        if (!m.nombre.trim()) continue
        try {
          await createMascota(tenantId, clienteCreado.id, {
            nombre: m.nombre.trim(),
            tipo: m.tipo,
            raza: m.raza.trim() || undefined,
          })
        } catch {
          mascotasConError++
        }
      }

      toast({
        title: "¡Listo, ya estás registrado!",
        description: mascotasConError > 0
          ? "Guardamos tus datos. Alguna mascota no se pudo guardar, podés cargarla de nuevo al sacar un turno."
          : "Tus datos quedaron guardados: sumás puntos para el sorteo y la próxima vez que saques un turno ya vas a estar cargado.",
      })
      resetear()
      setOpen(false)
      onExito?.()
    } catch (error) {
      console.error("Error en registro de cliente:", error)
      toast({
        title: "No pudimos completar el registro",
        description: "Intentá de nuevo en un momento. Si el problema sigue, contactanos por teléfono.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetear() }}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              size="lg"
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-2 border-white/30 font-bold text-lg h-14 px-10 rounded-full
                         backdrop-blur-md transition-all duration-300 hover:scale-105"
            >
              <UserPlus className="mr-2 h-5 w-5" />
              Registrarme como cliente
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            Registrate como cliente
          </DialogTitle>
          <DialogDescription>
            Dejá tus datos y los de tu mascota (opcional). Suma puntos para el sorteo
            y la próxima vez que reserves un turno ya vas a estar cargado.
          </DialogDescription>
        </DialogHeader>

        {paso === "dni" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-dni-inicial">DNI</Label>
              <Input
                id="reg-dni-inicial"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); continuar() } }}
                placeholder="30123456"
                autoFocus
              />
            </div>
            <Button className="w-full" disabled={buscando || !dni.trim()} onClick={continuar}>
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
            </Button>
          </div>
        )}

        {paso === "formulario" && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {reconocimiento === "local" && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0" /> Ya te tenemos registrado acá. Revisá tus datos y confirmá.
              </p>
            )}
            {reconocimiento === "global" && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0" /> Ya tenemos tus datos de otra veterinaria en VetPanel. Revisalos antes de confirmar.
              </p>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-nombre">Nombre y apellido *</Label>
                <Input
                  id="reg-nombre"
                  value={cliente.nombre}
                  onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))}
                  placeholder="Maria Perez"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-telefono">Telefono</Label>
                  <Input
                    id="reg-telefono"
                    value={cliente.telefono}
                    onChange={(e) => setCliente((c) => ({ ...c, telefono: e.target.value }))}
                    placeholder="11 2345-6789"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-dni">DNI</Label>
                  <Input
                    id="reg-dni"
                    value={cliente.dni}
                    onChange={(e) => setCliente((c) => ({ ...c, dni: e.target.value }))}
                    placeholder="30123456"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  value={cliente.email}
                  onChange={(e) => setCliente((c) => ({ ...c, email: e.target.value }))}
                  placeholder="maria@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-domicilio">Domicilio</Label>
                <Input
                  id="reg-domicilio"
                  value={cliente.domicilio}
                  onChange={(e) => setCliente((c) => ({ ...c, domicilio: e.target.value }))}
                  placeholder="Av. Siempre Viva 742"
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Tus mascotas (opcional)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMascotas((prev) => [...prev, { ...MASCOTA_VACIA }])}
                >
                  <PlusCircle className="mr-1.5 h-4 w-4" />
                  Agregar
                </Button>
              </div>

              {mascotas.map((m, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={m.nombre}
                      onChange={(e) => actualizarMascota(i, "nombre", e.target.value)}
                      placeholder="Nombre de la mascota"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={m.tipo} onValueChange={(v) => actualizarMascota(i, "tipo", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MASCOTAS_DEFAULT.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.emoji} {t.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={m.raza}
                        onChange={(e) => actualizarMascota(i, "raza", e.target.value)}
                        placeholder="Raza (opcional)"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setMascotas((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Registrarme
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
