import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ClienteSelector } from "./cliente-selector"
import type { Cliente } from "@/lib/supabase/types"

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const getClientesBasic = vi.fn()
vi.mock("@/lib/supabase/clientes", () => ({
  getClientesBasic: (...args: unknown[]) => getClientesBasic(...args),
  createCliente: vi.fn(),
}))

const cliente = (nombre: string, over: Partial<Cliente> = {}): Cliente =>
  ({ id: nombre, nombre, telefono: "", dni: "", email: "", ...over }) as Cliente

const ANA = cliente("Ana Gómez", { id: "ana" })
const JOSE = cliente("José Pérez", { id: "jose" })

beforeEach(() => {
  getClientesBasic.mockReset()
  getClientesBasic.mockResolvedValue([ANA, JOSE])
})

/**
 * Reproduce el flujo real: en mobile el carrito (con el ClienteSelector de
 * cuenta corriente adentro) se abre dentro de un <Dialog>. Radix Dialog es
 * modal por default y su FocusScope puede pelear por el foco con el Popover
 * anidado, dejando el input de búsqueda "muerto" (no tipeable) aunque la
 * lista se vea. Este test simula exactamente esa anidación.
 */
describe("ClienteSelector dentro de un Dialog modal (cuenta corriente en mobile)", () => {
  it("permite tipear en el buscador sin que el foco se lo devuelva al Dialog", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Carrito</DialogTitle>
          <ClienteSelector tenantId="vet" seleccionado={null} onCambiar={vi.fn()} obligatorio />
        </DialogContent>
      </Dialog>,
    )
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: /elegí un cliente/i }))
    const input = await screen.findByPlaceholderText(/buscar por nombre/i)

    fireEvent.change(input, { target: { value: "jose" } })
    expect(input).toHaveValue("jose")
    expect(await screen.findByText("José Pérez")).toBeInTheDocument()
  })

  it("permite hacer click en un cliente de la lista", async () => {
    const onCambiar = vi.fn()
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Carrito</DialogTitle>
          <ClienteSelector tenantId="vet" seleccionado={null} onCambiar={onCambiar} obligatorio />
        </DialogContent>
      </Dialog>,
    )
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: /elegí un cliente/i }))
    fireEvent.click(await screen.findByText("Ana Gómez"))

    expect(onCambiar).toHaveBeenCalledWith(ANA)
  })
})
