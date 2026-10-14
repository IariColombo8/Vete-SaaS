"use client"

import { useEffect, useState } from "react"
import { CreditCard, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/config"
import { PLANS, formatPrecioPlan, type PlanId } from "@/lib/plans"
import { iniciarCheckout } from "@/components/billing/use-billing"

interface Props {
  tenantId: string
  /** Plan a contratar; `null` cierra el diálogo. */
  plan: PlanId | null
  onClose: () => void
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Paso previo al checkout de Mercado Pago: pide el email de la cuenta de MP
 * con la que se va a pagar. MP solo deja pagar una suscripción a la cuenta
 * cuyo email coincide con el de la suscripción ("Tu e-mail no coincide con el
 * de la suscripción"), y muchas veterinarias entran a VetPanel con un email
 * distinto del de su Mercado Pago. Arranca con el email de la sesión.
 *
 * No depende del modo solo lectura: es justamente lo que se usa para salir de él.
 */
export function CheckoutDialog({ tenantId, plan, onClose }: Props) {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!plan) return
    setEnviando(false)
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""))
  }, [plan])

  const emailOk = EMAIL_VALIDO.test(email.trim())

  async function irAPagar(e: React.FormEvent) {
    e.preventDefault()
    if (!plan || !emailOk) return
    setEnviando(true)
    try {
      // Navega fuera de la página: nada de lo que venga después se ejecuta.
      window.location.href = await iniciarCheckout(tenantId, plan, email.trim())
    } catch (error) {
      toast({
        title: "No se pudo iniciar el pago",
        description: error instanceof Error ? error.message : "Intentá más tarde.",
        variant: "destructive",
      })
      setEnviando(false)
    }
  }

  return (
    <Dialog open={plan !== null} onOpenChange={(abierto) => !abierto && !enviando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={irAPagar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Contratar {plan ? PLANS[plan].nombre : ""}</DialogTitle>
            <DialogDescription>
              {plan ? `${formatPrecioPlan(plan)} por mes, con Mercado Pago. Cancelás cuando quieras.` : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="checkout-email-mp">Email de tu cuenta de Mercado Pago</Label>
            <Input
              id="checkout-email-mp"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
              required
            />
            <p className="text-xs text-muted-foreground">
              Tiene que ser el email de la cuenta de Mercado Pago con la que vas a pagar. Si no coincide, Mercado
              Pago rechaza el pago.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>
              Volver
            </Button>
            <Button type="submit" disabled={!emailOk || enviando} className="bg-emerald-600 hover:bg-emerald-700">
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Ir a pagar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
