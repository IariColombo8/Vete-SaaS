"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { createCliente, getClienteByDNI, getClienteGlobalPorDNI } from "@/lib/supabase/clientes"
import { createMascota, updateMascota, getMascotas } from "@/lib/supabase/mascotas"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { formatearEdad, type UnidadEdad } from "@/lib/mascotas/edad"
import { format } from "date-fns"
import { UserPlus, PlusCircle, Trash2, Loader2, PartyPopper, Sparkles } from "lucide-react"
import { guardarBorrador, leerBorrador, borrarBorrador } from "@/lib/forms/borrador"
import { useConfirmarCierre } from "@/hooks/useConfirmarCierre"
import { ConfirmarDescarteDialog } from "@/components/ui/confirmar-descarte-dialog"
import { RestaurarBorradorDialog } from "@/components/ui/restaurar-borrador-dialog"

/**
 * `publico` = lo usa la persona desde la página de la veterinaria ("Registrarme
 * como cliente"). `admin` = lo usa el staff desde Clientes / Libreta Sanitaria
 * para dar de alta un cliente y su mascota, o sumarle otra mascota a uno que
 * ya existe. Solo cambia el texto: el flujo y las RPC son las mismas.
 */
type ModoRegistro = "publico" | "admin"

interface RegistroClienteDialogProps {
  tenantId: string
  modo?: ModoRegistro
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
  /** Presente solo si la mascota ya existe en esta veterinaria: se actualiza en vez de crearse. */
  id?: string
  nombre: string
  tipo: string
  raza: string
  edadValor: string
  edadUnidad: UnidadEdad
  peso: string
  tieneChip: boolean
  chipNumero: string
}

type Paso = "dni" | "formulario"
type Reconocimiento = "ninguno" | "local" | "global"

const CLIENTE_VACIO = { nombre: "", telefono: "", email: "", dni: "", domicilio: "" }
const MASCOTA_VACIA: MascotaBorrador = {
  nombre: "", tipo: "perro", raza: "",
  edadValor: "", edadUnidad: "meses", peso: "",
  tieneChip: false, chipNumero: "",
}

interface FormularioBorrador {
  cliente: typeof CLIENTE_VACIO
  mascotas: MascotaBorrador[]
}

export function RegistroClienteDialog({
  tenantId, modo = "publico", trigger, dniInicial, onExito,
  open: openControlado, onOpenChange: onOpenChangeControlado,
}: RegistroClienteDialogProps) {
  const { toast } = useToast()
  const esAdmin = modo === "admin"
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
  /** Id del cliente que se encontró por DNI en esta veterinaria (si lo había). */
  const [clienteExistenteId, setClienteExistenteId] = useState<string | null>(null)
  /** Borrador encontrado en localStorage, distinto del estado base recién cargado: se le pregunta al usuario si quiere seguirlo. */
  const [borradorPendiente, setBorradorPendiente] = useState<{ valor: FormularioBorrador; guardadoEn: number } | null>(null)
  /** Key de localStorage del formulario actual (depende del DNI buscado); null hasta que se entra al paso "formulario". */
  const claveBorradorRef = useRef<string | null>(null)
  /** JSON del estado recién cargado (sin editar), para detectar si hubo cambios. */
  const snapshotRef = useRef<string>("")

  const resetear = () => {
    setPaso("dni")
    setDni(dniInicial ?? "")
    setReconocimiento("ninguno")
    setCliente(CLIENTE_VACIO)
    setMascotas([])
    setClienteExistenteId(null)
    setBorradorPendiente(null)
    claveBorradorRef.current = null
    snapshotRef.current = ""
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
      let base: FormularioBorrador
      let recon: Reconocimiento
      let existenteId: string | null = null

      const local = await getClienteByDNI(tenantId, dniLimpio)
      if (local?.id) {
        const mascotasLocales = await getMascotas(tenantId, local.id)
        // En admin el caso típico de un cliente que ya existe es justamente
        // "vengo a sumarle otra mascota": le dejamos la fila vacía lista.
        const filaExtra = esAdmin ? [{ ...MASCOTA_VACIA }] : []
        base = {
          cliente: {
            nombre: local.nombre, telefono: local.telefono, email: local.email,
            domicilio: local.domicilio ?? "", dni: dniLimpio,
          },
          mascotas: [...mascotasLocales.map((m) => ({
            id: m.id, nombre: m.nombre, tipo: m.tipo, raza: m.raza ?? "",
            edadValor: m.edadValor !== undefined ? String(m.edadValor) : "",
            edadUnidad: m.edadUnidad ?? "meses",
            peso: (m.peso ?? "").replace(/[^\d.,]/g, ""),
            tieneChip: m.tieneChip ?? false,
            chipNumero: m.chipNumero ?? "",
          })), ...filaExtra],
        }
        recon = "local"
        existenteId = local.id
      } else {
        const global = await getClienteGlobalPorDNI(dniLimpio)
        if (global) {
          base = {
            cliente: {
              nombre: global.nombre, telefono: global.telefono, email: global.email,
              domicilio: global.domicilio, dni: dniLimpio,
            },
            mascotas: global.mascotas.map((m) => ({
              nombre: m.nombre, tipo: m.tipo, raza: m.raza ?? "",
              edadValor: "", edadUnidad: "meses" as UnidadEdad, peso: "",
              tieneChip: false, chipNumero: "",
            })),
          }
          recon = "global"
        } else {
          base = { cliente: { ...CLIENTE_VACIO, dni: dniLimpio }, mascotas: [] }
          recon = "ninguno"
        }
      }

      setClienteExistenteId(existenteId)
      setReconocimiento(recon)

      // La key incluye modo+DNI: un borrador de "sumarle una mascota a Juan"
      // no se mezcla con el de "dar de alta a Juan desde cero" ni con el del
      // registro público, aunque compartan DNI y navegador.
      const clave = `registro-cliente:${tenantId}:${modo}:${dniLimpio}`
      claveBorradorRef.current = clave
      snapshotRef.current = JSON.stringify(base)

      const borrador = leerBorrador<FormularioBorrador>(clave)
      if (borrador && JSON.stringify(borrador.valor) !== snapshotRef.current) {
        // Se muestra el estado base mientras se pregunta; si el usuario
        // confirma, recién ahí se pisa con el borrador.
        setBorradorPendiente(borrador)
      } else {
        setBorradorPendiente(null)
      }
      setCliente(base.cliente)
      setMascotas(base.mascotas)
      setPaso("formulario")
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    if (open && dniInicial) continuar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dniInicial])

  // Autoguardado del borrador mientras se edita. Se frena mientras hay un
  // borradorPendiente sin decidir, para no pisarlo con el estado base recién
  // cargado (que en ese momento es distinto al borrador por definición).
  useEffect(() => {
    const clave = claveBorradorRef.current
    if (paso !== "formulario" || !clave || borradorPendiente) return
    const actual = JSON.stringify({ cliente, mascotas } satisfies FormularioBorrador)
    if (actual === snapshotRef.current) {
      borrarBorrador(clave)
      return
    }
    guardarBorrador(clave, { cliente, mascotas } satisfies FormularioBorrador)
  }, [cliente, mascotas, paso, borradorPendiente])

  const restaurarBorrador = () => {
    if (!borradorPendiente) return
    setCliente(borradorPendiente.valor.cliente)
    setMascotas(borradorPendiente.valor.mascotas)
    setBorradorPendiente(null)
  }

  const descartarBorradorPendiente = () => {
    if (claveBorradorRef.current) borrarBorrador(claveBorradorRef.current)
    setBorradorPendiente(null)
  }

  const actualizarMascota = (i: number, campo: keyof MascotaBorrador, valor: string | boolean) => {
    setMascotas((prev) => prev.map((m, idx) => (idx === i ? { ...m, [campo]: valor } : m)))
  }

  /** Devuelve `true` si guardó con éxito (recién ahí se cierra el diálogo). */
  const guardarTodo = async (): Promise<boolean> => {
    if (!cliente.nombre.trim()) {
      toast({
        title: esAdmin ? "Falta el nombre del cliente" : "Falta tu nombre",
        description: esAdmin
          ? "Cargá el nombre y apellido para poder registrarlo."
          : "Contanos como te llamas para registrarte.",
        variant: "destructive",
      })
      return false
    }

    setLoading(true)
    try {
      const clienteCreado = await createCliente(tenantId, cliente)
      // Si cambiaron el DNI en el formulario, el upsert pudo caer en OTRO
      // cliente: ahí los ids de mascota que trajimos ya no le pertenecen y
      // hay que crearlas, no actualizarlas.
      const mismoCliente = clienteExistenteId !== null && clienteExistenteId === clienteCreado.id

      // Best-effort: si falla una mascota puntual no queremos que el
      // registro del cliente (lo que importa para el sorteo) se pierda.
      let mascotasConError = 0
      const hoy = format(new Date(), "yyyy-MM-dd")
      for (const m of mascotas) {
        if (!m.nombre.trim()) continue
        const edadValor = m.edadValor ? Number(m.edadValor) : undefined
        const datosEdad = edadValor !== undefined && !Number.isNaN(edadValor)
          ? {
              edad: formatearEdad({ valor: edadValor, unidad: m.edadUnidad }),
              edadValor,
              edadUnidad: m.edadUnidad,
              edadRegistradaEn: hoy,
            }
          : {}
        // Los campos vacíos se omiten a propósito: la RPC de update hace
        // coalesce, así que mandar "" pisaría con vacío un dato que ya estaba
        // cargado. Desde acá se completa o se corrige, nunca se borra.
        const datos = {
          nombre: m.nombre.trim(),
          tipo: m.tipo,
          raza: m.raza.trim() || undefined,
          peso: m.peso.trim() ? `${m.peso.trim()} kg` : undefined,
          tieneChip: m.tieneChip,
          chipNumero: m.tieneChip ? m.chipNumero.trim() || undefined : undefined,
          ...datosEdad,
        }
        try {
          if (m.id && mismoCliente) {
            await updateMascota(tenantId, clienteCreado.id, m.id, datos)
          } else {
            await createMascota(tenantId, clienteCreado.id, datos)
          }
        } catch (error) {
          // Se sigue con las demás (el cliente ya quedó guardado), pero el
          // error no se descarta: sin esto, una mascota que no entraba
          // desaparecía sin dejar rastro de por qué.
          console.error(`No se pudo guardar la mascota "${m.nombre}":`, error)
          mascotasConError++
        }
      }

      const tituloOk = esAdmin
        ? (reconocimiento === "local" ? "Cliente actualizado" : "Cliente registrado")
        : "¡Listo, ya estás registrado!"
      const detalleOk = esAdmin
        ? "Los datos y las mascotas quedaron guardados en la ficha del cliente."
        : "Tus datos quedaron guardados: sumás puntos para el sorteo y la próxima vez que saques un turno ya vas a estar cargado."
      const detalleError = esAdmin
        ? "Guardamos el cliente, pero alguna mascota no se pudo cargar. Probá agregarla de nuevo."
        : "Guardamos tus datos. Alguna mascota no se pudo guardar, podés cargarla de nuevo al sacar un turno."

      toast({
        title: tituloOk,
        description: mascotasConError > 0 ? detalleError : detalleOk,
      })
      if (claveBorradorRef.current) borrarBorrador(claveBorradorRef.current)
      resetear()
      setOpen(false)
      onExito?.()
      return true
    } catch (error) {
      console.error("Error en registro de cliente:", error)
      toast({
        title: "No pudimos completar el registro",
        description: esAdmin
          ? "Intentá de nuevo en un momento. Si el problema sigue, revisá la conexión. Lo que cargaste queda guardado como borrador."
          : "Intentá de nuevo en un momento. Si el problema sigue, contactanos por teléfono. Lo que cargaste queda guardado como borrador.",
        variant: "destructive",
      })
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await guardarTodo()
  }

  const hayCambiosSinGuardar =
    paso === "formulario" &&
    !borradorPendiente &&
    JSON.stringify({ cliente, mascotas } satisfies FormularioBorrador) !== snapshotRef.current

  const {
    confirmando: confirmandoCierre,
    guardando: guardandoDesdeCierre,
    solicitarCierre,
    confirmarGuardar: confirmarGuardarYCerrar,
    confirmarDescartar: confirmarDescartarYCerrar,
    cancelarCierre,
  } = useConfirmarCierre({
    hayCambios: hayCambiosSinGuardar,
    onGuardar: guardarTodo,
    onDescartar: () => {
      if (claveBorradorRef.current) borrarBorrador(claveBorradorRef.current)
      resetear()
      setOpen(false)
    },
  })

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) { setOpen(true); return }
        if (solicitarCierre()) setOpen(false)
      }}
    >
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border-2 border-white/30 font-bold text-sm sm:text-lg h-11 sm:h-14 px-6 sm:px-10 rounded-full
                         backdrop-blur-md transition-all duration-300 hover:scale-105"
            >
              <UserPlus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Registrarme como cliente
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {esAdmin
              ? <UserPlus className="h-5 w-5 text-primary" />
              : <PartyPopper className="h-5 w-5 text-primary" />}
            {esAdmin ? "Registrar cliente y su mascota" : "Registrate como cliente"}
          </DialogTitle>
          <DialogDescription>
            {esAdmin
              ? "Buscá por DNI: si ya es cliente, se actualizan sus datos y podés sumarle otra mascota. Si no, se crea el cliente con sus mascotas."
              : "Dejá tus datos y los de tu mascota (opcional). Suma puntos para el sorteo y la próxima vez que reserves un turno ya vas a estar cargado."}
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
                <Sparkles className="h-3.5 w-3.5 shrink-0" />{" "}
                {esAdmin
                  ? "Ya es cliente de la veterinaria. Revisá sus datos y agregá la mascota nueva."
                  : "Ya te tenemos registrado acá. Revisá tus datos y confirmá."}
              </p>
            )}
            {reconocimiento === "global" && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />{" "}
                {esAdmin
                  ? "Es cliente de otra veterinaria en VetPanel. Revisá los datos antes de confirmar el alta."
                  : "Ya tenemos tus datos de otra veterinaria en VetPanel. Revisalos antes de confirmar."}
              </p>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-nombre">Nombre y apellido {esAdmin ? "del cliente *" : "*"}</Label>
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
                <Label className="text-sm font-semibold">
                  {esAdmin ? "Mascotas del cliente" : "Tus mascotas (opcional)"}
                </Label>
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
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={m.edadValor}
                        onChange={(e) => actualizarMascota(i, "edadValor", e.target.value)}
                        placeholder="Edad"
                      />
                      <Select value={m.edadUnidad} onValueChange={(v) => actualizarMascota(i, "edadUnidad", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meses">meses</SelectItem>
                          <SelectItem value="anios">años</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={m.peso}
                        onChange={(e) => actualizarMascota(i, "peso", e.target.value)}
                        placeholder="Peso (kg)"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`tieneChip-${i}`}
                          checked={m.tieneChip}
                          onCheckedChange={(checked) => actualizarMascota(i, "tieneChip", checked === true)}
                        />
                        <Label htmlFor={`tieneChip-${i}`} className="text-sm font-normal cursor-pointer">
                          Tiene Chip
                        </Label>
                      </div>
                      {m.tieneChip && (
                        <Input
                          value={m.chipNumero}
                          onChange={(e) => actualizarMascota(i, "chipNumero", e.target.value)}
                          placeholder="Número de chip"
                        />
                      )}
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
                {esAdmin ? "Guardar cliente" : "Registrarme"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>

    <ConfirmarDescarteDialog
      open={confirmandoCierre}
      guardando={guardandoDesdeCierre}
      entidad={esAdmin ? "el cliente" : "tus datos"}
      onGuardar={confirmarGuardarYCerrar}
      onDescartar={confirmarDescartarYCerrar}
      onCancelar={cancelarCierre}
    />

    <RestaurarBorradorDialog
      open={borradorPendiente !== null}
      guardadoEn={borradorPendiente?.guardadoEn}
      onRestaurar={restaurarBorrador}
      onDescartar={descartarBorradorPendiente}
    />
    </>
  )
}
