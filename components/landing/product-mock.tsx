import type { ReactNode, ReactElement } from "react"
import {
  Check,
  CalendarDays,
  Clock,
  Mail,
  ChevronRight,
  MessageCircle,
} from "lucide-react"
import { Paw, DogFace, Vaccine } from "@/components/landing/pet-art"

export type MockScreen = "reservar" | "confirmar" | "libreta" | "recordatorio"

/** Marco tipo ventana de navegador que envuelve cada pantalla. */
function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app-window w-full overflow-hidden rounded-3xl border border-warm-border bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-warm-border bg-cream px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff6b5c]" />
        <span className="h-3 w-3 rounded-full bg-[#f5a623]" />
        <span className="h-3 w-3 rounded-full bg-[#14b8a6]" />
        <div className="ml-3 flex flex-1 items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[11px] text-ink-muted">
          <Paw className="h-3 w-3 text-coral" />
          vetpanel.com.ar/mi-clinica
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  )
}

function ReservarScreen() {
  const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]
  return (
    <div>
      <p className="font-display text-lg font-semibold text-ink">Reservar turno</p>
      <p className="mb-4 text-xs text-ink-muted">Elegí mascota, servicio y horario</p>

      <div className="mb-3 flex gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white">
          <DogFace className="h-4 w-4" /> Firulais
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-xs font-medium text-ink-muted">
          + Otra mascota
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-warm-border bg-cream px-3 py-2.5">
        <span className="text-sm font-medium text-ink">Consulta general</span>
        <ChevronRight className="h-4 w-4 text-ink-muted" />
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-muted">
        <CalendarDays className="h-3.5 w-3.5 text-coral" /> Jueves 12 de junio
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        {slots.map((s) => {
          const active = s === "10:30"
          return (
            <div
              key={s}
              className={`rounded-lg py-2 text-center text-sm font-semibold ${
                active
                  ? "bg-coral text-white shadow-md shadow-coral/30"
                  : "border border-warm-border bg-white text-ink"
              }`}
            >
              {s}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl bg-coral py-3 text-center text-sm font-bold text-white shadow-lg shadow-coral/25">
        Confirmar turno
      </div>
    </div>
  )
}

function ConfirmarScreen() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-soft">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal text-white">
          <Check className="h-6 w-6" strokeWidth={3} />
        </div>
      </div>
      <p className="font-display text-xl font-semibold text-ink">¡Turno confirmado!</p>
      <p className="mb-5 text-xs text-ink-muted">Le avisamos al dueño automáticamente</p>

      <div className="rounded-2xl border border-warm-border bg-cream p-4 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-coral-soft">
            <DogFace className="h-7 w-7 text-coral" />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-ink leading-tight">Firulais</p>
            <p className="text-xs text-ink-muted">Consulta general</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs font-medium text-ink">
            <CalendarDays className="h-3.5 w-3.5 text-coral" /> Jue 12 jun
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs font-medium text-ink">
            <Clock className="h-3.5 w-3.5 text-teal" /> 10:30 hs
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-muted">
        <Mail className="h-3.5 w-3.5 text-teal" /> Detalle enviado por email
      </div>
    </div>
  )
}

function LibretaScreen() {
  const vacunas = [
    { name: "Antirrábica", status: "Al día", ok: true },
    { name: "Quíntuple", status: "Al día", ok: true },
    { name: "Antiparasitaria", status: "En 7 días", ok: false },
  ]
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-coral-soft">
          <DogFace className="h-7 w-7 text-coral" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-ink leading-tight">Libreta sanitaria</p>
          <p className="text-xs text-ink-muted">Firulais · Labrador · 4 años</p>
        </div>
        <span className="ml-auto rounded-lg bg-cream px-2.5 py-1.5 text-xs font-semibold text-ink">28.5 kg</span>
      </div>

      <div className="space-y-2">
        {vacunas.map((v) => (
          <div
            key={v.name}
            className="flex items-center gap-3 rounded-xl border border-warm-border bg-cream px-3 py-2.5"
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${v.ok ? "bg-teal-soft text-teal" : "bg-coral-soft text-coral"}`}>
              <Vaccine className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-ink">{v.name}</span>
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                v.ok ? "bg-teal-soft text-teal" : "bg-coral-soft text-coral"
              }`}
            >
              {v.ok && <Check className="h-3 w-3" />}
              {v.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecordatorioScreen() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal text-white">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink leading-tight">WhatsApp</p>
          <p className="text-[11px] text-ink-muted">Recordatorio automático</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-bold text-teal">
          <Check className="h-3 w-3" /> Enviado
        </span>
      </div>

      <div className="space-y-2">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-cream px-4 py-3 text-sm text-ink">
          🐾 ¡Hola Ana! Te recordamos que <b>Firulais</b> tiene turno mañana
          <b> jueves 12/6 a las 10:30</b> en la clínica.
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-cream px-4 py-3 text-sm text-ink">
          La antiparasitaria vence pronto 💉 ¿La sumamos a la visita?
        </div>
        <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-teal px-4 py-3 text-sm text-white">
          ¡Dale, gracias! Ahí estamos 🐶
        </div>
      </div>
    </div>
  )
}

const SCREENS: Record<MockScreen, () => ReactElement> = {
  reservar: ReservarScreen,
  confirmar: ConfirmarScreen,
  libreta: LibretaScreen,
  recordatorio: RecordatorioScreen,
}

export function ProductMock({ screen }: { screen: MockScreen }) {
  const Screen = SCREENS[screen]
  return (
    <AppFrame>
      <Screen />
    </AppFrame>
  )
}
