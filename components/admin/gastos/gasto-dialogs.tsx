"use client"

import { useState } from "react"
import { Banknote, CalendarClock, Receipt, Wallet } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import { mesDe, mesesDesde, nombreMes } from "@/lib/gastos/meses"
import type { Gasto, GastoFijo } from "@/lib/supabase/types"
import type { GastoFijoInput } from "@/lib/supabase/gastos"

/** Sugerencias para el campo categoría; se puede escribir cualquier otra. */
export const CATEGORIAS_GASTO = [
  "Alquiler", "Servicios", "Sueldos", "Proveedores", "Impuestos",
  "Mantenimiento", "Insumos", "Otros",
]

/** YYYY-MM-DD en hora local: `toISOString()` corre el día en Argentina. */
export function hoyISO(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, "0")
  const dia = String(hoy.getDate()).padStart(2, "0")
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

export interface GastoUnicoInput {
  descripcion: string
  categoria: string
  monto: number
  fecha: string
}

function CampoCategoria({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="gasto-categoria">Categoría (opcional)</Label>
      <Input
        id="gasto-categoria"
        list="gasto-categorias"
        value={value}
        placeholder="Ej: Servicios"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="gasto-categorias">
        {CATEGORIAS_GASTO.map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  )
}

/**
 * Alta de un gasto. Por única vez: se registra y se pregunta si sale de la
 * caja. Fijo: se crea la plantilla mensual; cada mes se marca pagado aparte.
 */
export function NuevoGastoDialog({
  onCerrar,
  onUnico,
  onFijo,
}: {
  onCerrar: () => void
  /** El llamador se encarga de preguntar por la caja y registrar. */
  onUnico: (input: GastoUnicoInput) => void
  onFijo: (input: GastoFijoInput) => Promise<void>
}) {
  const [tipo, setTipo] = useState<"unico" | "fijo">("unico")
  const [descripcion, setDescripcion] = useState("")
  const [categoria, setCategoria] = useState("")
  const [monto, setMonto] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [desdeMes, setDesdeMes] = useState(mesDe().slice(0, 7))
  const [dia, setDia] = useState("")
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    const valor = Number(monto)
    if (!descripcion.trim()) return toast.error("Escribí qué es el gasto")
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Ingresá un monto válido")

    if (tipo === "unico") {
      if (!fecha) return toast.error("Elegí la fecha del gasto")
      onUnico({ descripcion, categoria, monto: valor, fecha })
      return
    }

    const diaNum = dia ? Number(dia) : undefined
    if (diaNum != null && (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31)) {
      return toast.error("El día de vencimiento tiene que estar entre 1 y 31")
    }
    if (!desdeMes) return toast.error("Elegí desde qué mes corre")

    setGuardando(true)
    try {
      await onFijo({
        descripcion, categoria, monto: valor, diaVencimiento: diaNum, desdeMes: `${desdeMes}-01`,
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
          <DialogDescription>
            Un gasto fijo se repite todos los meses; uno por única vez se registra una sola vez.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "unico", label: "Por única vez", icono: Receipt },
            { id: "fijo", label: "Fijo mensual", icono: CalendarClock },
          ] as const).map(({ id, label, icono: Icono }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTipo(id)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                tipo === id
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "hover:bg-muted",
              )}
            >
              <Icono className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="gasto-desc">Descripción</Label>
            <Input
              id="gasto-desc"
              value={descripcion}
              autoFocus
              placeholder={tipo === "fijo" ? "Ej: Alquiler del local" : "Ej: Arreglo de la heladera"}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <CampoCategoria value={categoria} onChange={setCategoria} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gasto-monto">{tipo === "fijo" ? "Monto mensual" : "Monto"}</Label>
              <Input
                id="gasto-monto"
                type="number"
                min={0}
                step={100}
                value={monto}
                placeholder="0"
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>

            {tipo === "unico" ? (
              <div className="space-y-2">
                <Label htmlFor="gasto-fecha">Fecha</Label>
                <Input id="gasto-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="gasto-desde">Desde el mes</Label>
                <Input id="gasto-desde" type="month" value={desdeMes} onChange={(e) => setDesdeMes(e.target.value)} />
              </div>
            )}
          </div>

          {tipo === "fijo" && (
            <div className="space-y-2">
              <Label htmlFor="gasto-dia">Vence el día (opcional)</Label>
              <Input
                id="gasto-dia"
                type="number"
                min={1}
                max={31}
                value={dia}
                placeholder="Ej: 10"
                onChange={(e) => setDia(e.target.value)}
                className="w-28"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
            {tipo === "fijo" ? "Crear gasto fijo" : "Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Edición de la plantilla de un gasto fijo (monto base, nombre, vencimiento). */
export function EditarGastoFijoDialog({
  fijo,
  onCerrar,
  onGuardar,
}: {
  fijo: GastoFijo
  onCerrar: () => void
  onGuardar: (input: GastoFijoInput) => Promise<void>
}) {
  const [descripcion, setDescripcion] = useState(fijo.descripcion)
  const [categoria, setCategoria] = useState(fijo.categoria)
  const [monto, setMonto] = useState(String(fijo.monto))
  const [dia, setDia] = useState(fijo.diaVencimiento ? String(fijo.diaVencimiento) : "")
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    const valor = Number(monto)
    if (!descripcion.trim()) return toast.error("Escribí qué es el gasto")
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Ingresá un monto válido")
    const diaNum = dia ? Number(dia) : undefined
    if (diaNum != null && (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31)) {
      return toast.error("El día de vencimiento tiene que estar entre 1 y 31")
    }

    setGuardando(true)
    try {
      await onGuardar({
        descripcion, categoria, monto: valor, diaVencimiento: diaNum, desdeMes: fijo.desdeMes,
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar gasto fijo</DialogTitle>
          <DialogDescription>
            El monto base vale para todos los meses que no tengan un monto propio. Los meses ya
            pagados no cambian.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="fijo-desc">Descripción</Label>
            <Input id="fijo-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <CampoCategoria value={categoria} onChange={setCategoria} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fijo-monto">Monto base</Label>
              <Input
                id="fijo-monto"
                type="number"
                min={0}
                step={100}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fijo-dia">Vence el día</Label>
              <Input
                id="fijo-dia"
                type="number"
                min={1}
                max={31}
                value={dia}
                placeholder="—"
                onChange={(e) => setDia(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Monto de un gasto fijo mes por mes: "este mes tanto, el que viene tanto".
 * Un mes vacío usa el monto base.
 */
export function MontosPorMesDialog({
  fijo,
  desde,
  montosActuales,
  onCerrar,
  onGuardar,
}: {
  fijo: GastoFijo
  /** Primer mes de la grilla ("YYYY-MM-01"). */
  desde: string
  /** `mes → monto` ya cargados para este gasto. */
  montosActuales: Map<string, number>
  onCerrar: () => void
  onGuardar: (montos: { mes: string; monto: number | null }[]) => Promise<void>
}) {
  const meses = mesesDesde(desde, 12).filter(
    (m) => m >= fijo.desdeMes && (!fijo.hastaMes || m <= fijo.hastaMes),
  )
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(meses.map((m) => [m, montosActuales.has(m) ? String(montosActuales.get(m)) : ""])),
  )
  const [guardando, setGuardando] = useState(false)

  /** Copia el valor de un mes a todos los siguientes de la grilla. */
  const copiarHaciaAdelante = (mes: string) => {
    const valor = valores[mes]
    setValores((prev) => {
      const nuevo = { ...prev }
      for (const m of meses) if (m > mes) nuevo[m] = valor
      return nuevo
    })
  }

  const guardar = async () => {
    const montos: { mes: string; monto: number | null }[] = []
    for (const m of meses) {
      const texto = valores[m]?.trim() ?? ""
      if (texto === "") {
        if (montosActuales.has(m)) montos.push({ mes: m, monto: null })
        continue
      }
      const valor = Number(texto)
      if (!Number.isFinite(valor) || valor <= 0) {
        toast.error(`El monto de ${nombreMes(m)} no es válido`)
        return
      }
      if (valor !== montosActuales.get(m)) montos.push({ mes: m, monto: valor })
    }

    setGuardando(true)
    try {
      await onGuardar(montos)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Montos por mes · {fijo.descripcion}</DialogTitle>
          <DialogDescription>
            Dejá vacío un mes para usar el monto base ({formatCurrency(fijo.monto)}). Cambiar un mes
            ya pagado no modifica lo que se pagó.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {meses.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-sm capitalize">{nombreMes(m)}</span>
              <Input
                type="number"
                min={0}
                step={100}
                value={valores[m] ?? ""}
                placeholder={String(fijo.monto)}
                onChange={(e) => setValores((prev) => ({ ...prev, [m]: e.target.value }))}
                className="h-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs"
                title="Usar este monto en los meses siguientes"
                disabled={!valores[m]}
                onClick={() => copiarHaciaAdelante(m)}
              >
                ↓ siguientes
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
            Guardar montos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Anulación de un gasto cargado por error. El motivo es obligatorio: el gasto
 * queda guardado como anulado y sin él no se entiende después qué pasó.
 */
export function AnularGastoDialog({
  gasto,
  onCerrar,
  onAnular,
}: {
  gasto: Gasto
  onCerrar: () => void
  onAnular: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)

  const anular = async () => {
    if (!motivo.trim()) return toast.error("Escribí por qué se anula")
    setGuardando(true)
    try {
      await onAnular(motivo.trim())
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular gasto</DialogTitle>
          <DialogDescription>
            {gasto.descripcion} ·{" "}
            <span className="font-semibold text-foreground">{formatCurrency(gasto.monto)}</span>
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          El gasto queda guardado como anulado y deja de sumar en los totales.
          {gasto.gastoFijoId && " El mes vuelve a quedar pendiente de pago."}
          {gasto.cajaId &&
            " Si la caja de la que salió sigue abierta, el monto vuelve a contar en el efectivo esperado; si ya se cerró, ese cierre no cambia."}
        </p>

        <div className="space-y-2">
          <Label htmlFor="anular-motivo">Motivo</Label>
          <Textarea
            id="anular-motivo"
            rows={3}
            value={motivo}
            autoFocus
            placeholder="Ej: lo cargué dos veces / el monto era otro"
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button variant="destructive" onClick={anular} disabled={guardando || !motivo.trim()}>
            Anular gasto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * La pregunta de siempre antes de registrar un pago: ¿la plata sale del cajón?
 * Si sale, el gasto se resta del efectivo esperado al cerrar la caja.
 *
 * Sin caja abierta no hace falta ir a Caja y volver: se pide el saldo inicial
 * acá mismo y se abre la caja antes de registrar el gasto.
 */
export function DescontarCajaDialog({
  descripcion,
  monto,
  hayCajaAbierta,
  onCerrar,
  onResponder,
  onAbrirCajaYGuardar,
}: {
  descripcion: string
  monto: number
  hayCajaAbierta: boolean
  onCerrar: () => void
  onResponder: (descontar: boolean) => Promise<void>
  onAbrirCajaYGuardar: (saldoInicial: number) => Promise<void>
}) {
  const [guardando, setGuardando] = useState(false)
  const [saldoInicial, setSaldoInicial] = useState("")

  const responder = async (descontar: boolean) => {
    setGuardando(true)
    try {
      await onResponder(descontar)
    } finally {
      setGuardando(false)
    }
  }

  const abrirYGuardar = async () => {
    const saldo = saldoInicial.trim() === "" ? 0 : Number(saldoInicial)
    if (!Number.isFinite(saldo) || saldo < 0) return toast.error("El saldo inicial no es válido")
    setGuardando(true)
    try {
      await onAbrirCajaYGuardar(saldo)
    } finally {
      setGuardando(false)
    }
  }

  if (!hayCajaAbierta) {
    return (
      <Dialog open onOpenChange={(v) => !v && !guardando && onCerrar()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Lo descontás de la caja?</DialogTitle>
            <DialogDescription>
              {descripcion} · <span className="font-semibold text-foreground">{formatCurrency(monto)}</span>
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            No hay ninguna caja abierta. Si la plata sale del cajón, abrila ahora con el
            efectivo que hay y el gasto se descuenta de ahí.
          </p>

          <div className="space-y-2">
            <Label htmlFor="gasto-saldo-inicial">Efectivo en el cajón al abrir</Label>
            <Input
              id="gasto-saldo-inicial"
              type="number"
              min={0}
              step={100}
              value={saldoInicial}
              autoFocus
              placeholder="0"
              onChange={(e) => setSaldoInicial(e.target.value)}
              className="h-11 text-lg"
            />
          </div>

          <div className="grid gap-2">
            <Button
              onClick={abrirYGuardar}
              disabled={guardando}
              className="justify-start bg-emerald-600 hover:bg-emerald-700"
            >
              <Wallet className="mr-2 h-4 w-4" /> Abrir caja y guardar gasto
            </Button>
            <Button variant="outline" onClick={() => responder(false)} disabled={guardando} className="justify-start">
              <Banknote className="mr-2 h-4 w-4" /> No, lo pagué por otro lado
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Lo descontás de la caja?</DialogTitle>
          <DialogDescription>
            {descripcion} · <span className="font-semibold text-foreground">{formatCurrency(monto)}</span>
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Si la plata sale del cajón, se resta de lo que debería haber al cerrar la caja.
        </p>

        <div className="grid gap-2">
          <Button
            onClick={() => responder(true)}
            disabled={guardando}
            className="justify-start bg-emerald-600 hover:bg-emerald-700"
          >
            <Wallet className="mr-2 h-4 w-4" /> Sí, sale de la caja
          </Button>
          <Button variant="outline" onClick={() => responder(false)} disabled={guardando} className="justify-start">
            <Banknote className="mr-2 h-4 w-4" /> No, lo pagué por otro lado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
