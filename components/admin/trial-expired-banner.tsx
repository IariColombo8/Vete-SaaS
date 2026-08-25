import { AlertTriangle, MessageCircle } from "lucide-react"

const WHATSAPP_SERVITEC = "https://wa.me/5493442646670"
const LINKTREE_SERVITEC = "https://linktr.ee/serviteccdelu"

export function TrialExpiredBanner() {
  return (
    <div className="flex flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Tu prueba del plan Pro terminó. El panel quedó en modo solo lectura —
        contactate con ServiTec para reactivarlo.
      </div>
      <div className="flex gap-2">
        <a
          href={WHATSAPP_SERVITEC}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </a>
        <a
          href={LINKTREE_SERVITEC}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          Más contactos
        </a>
      </div>
    </div>
  )
}
