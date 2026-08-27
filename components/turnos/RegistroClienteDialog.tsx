"use client"

import { useState, type ReactNode } from "react"
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
import { createCliente } from "@/lib/supabase/clientes"
import { createMascota } from "@/lib/supabase/mascotas"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { UserPlus, PlusCircle, Trash2, Loader2, PartyPopper } from "lucide-react"

interface RegistroClienteDialogProps {
  tenantId: string
  trigger?: ReactNode
}

interface MascotaBorrador {
  nombre: string
  tipo: string
  raza: string
}

const CLIENTE_VACIO = { nombre: "", telefono: "", email: "", dni: "", domicilio: "" }
const MASCOTA_VACIA: MascotaBorrador = { nombre: "", tipo: "perro", raza: "" }

export function RegistroClienteDialog({ tenantId, trigger }: RegistroClienteDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cliente, setCliente] = useState(CLIENTE_VACIO)
  const [mascotas, setMascotas] = useState<MascotaBorrador[]>([])

  const resetear = () => {
    setCliente(CLIENTE_VACIO)
    setMascotas([])
  }

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

        <form onSubmit={handleSubmit} className="space-y-5">
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
      </DialogContent>
    </Dialog>
  )
}
