import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
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

const ANA = cliente("Ana Gómez", { id: "ana", telefono: "3511111111" })
const JOSE = cliente("José Pérez", { id: "jose" })
const CONSUMIDOR = cliente("Consumidor final", { id: "cf" })

const abrirLista = async () => {
  fireEvent.click(screen.getByRole("button", { name: /consumidor final|cambiar|elegí un cliente/i }))
  return await screen.findByPlaceholderText(/buscar por nombre/i)
}

beforeEach(() => {
  getClientesBasic.mockReset()
  getClientesBasic.mockResolvedValue([ANA, CONSUMIDOR, JOSE])
})

describe("ClienteSelector", () => {
  it("elige la fila 'Consumidor final' sola cuando no hay cliente", async () => {
    const onCambiar = vi.fn()
    render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={onCambiar} />)

    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(CONSUMIDOR))
  })

  it("no elige nada sola si el tenant no creó la fila", async () => {
    getClientesBasic.mockResolvedValue([ANA, JOSE])
    const onCambiar = vi.fn()
    render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={onCambiar} />)

    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())
    expect(onCambiar).not.toHaveBeenCalled()
  })

  it("con un cliente ya elegido se puede abrir la lista y cambiarlo", async () => {
    const onCambiar = vi.fn()
    render(<ClienteSelector tenantId="vet" seleccionado={ANA} onCambiar={onCambiar} />)
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    // El trigger muestra al elegido y sigue abriendo la misma lista.
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument()
    await abrirLista()
    fireEvent.click(await screen.findByText("José Pérez"))

    expect(onCambiar).toHaveBeenCalledWith(JOSE)
  })

  it("vuelve a 'Consumidor final' al quitar el cliente", async () => {
    const onCambiar = vi.fn()
    render(<ClienteSelector tenantId="vet" seleccionado={ANA} onCambiar={onCambiar} />)
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: /quitar cliente/i }))

    expect(onCambiar).toHaveBeenCalledWith(CONSUMIDOR)
  })

  it("lista 'Consumidor final' primero, antes del orden alfabético", async () => {
    render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={vi.fn()} />)
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    await abrirLista()
    const items = await screen.findAllByRole("option")
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Consumidor final"),
      expect.stringContaining("Ana Gómez"),
      expect.stringContaining("José Pérez"),
    ])
  })

  it("encuentra a 'José' buscando sin acento", async () => {
    render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={vi.fn()} />)
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    const input = await abrirLista()
    fireEvent.change(input, { target: { value: "jose" } })

    expect(await screen.findByText("José Pérez")).toBeInTheDocument()
    expect(screen.queryByText("Ana Gómez")).not.toBeInTheDocument()
  })

  it("busca por teléfono, que muchas veces es lo único que se sabe", async () => {
    render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={vi.fn()} />)
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    const input = await abrirLista()
    fireEvent.change(input, { target: { value: "3511111" } })

    expect(await screen.findByText("Ana Gómez")).toBeInTheDocument()
    expect(screen.queryByText("José Pérez")).not.toBeInTheDocument()
  })

  it("distingue clientes homónimos sin teléfono ni DNI", async () => {
    const juan1 = cliente("Juan Perez", { id: "j1" })
    const juan2 = cliente("Juan Perez", { id: "j2" })
    getClientesBasic.mockResolvedValue([juan1, juan2])
    const onCambiar = vi.fn()
    render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={onCambiar} />)
    await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: /consumidor final/i }))
    const items = await screen.findAllByRole("option")
    expect(items).toHaveLength(2)

    fireEvent.click(items[1])
    expect(onCambiar).toHaveBeenCalledWith(juan2)
  })

  describe("obligatorio (cuenta corriente)", () => {
    it("no ofrece 'Consumidor final' en la lista", async () => {
        render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={vi.fn()} obligatorio />)
      await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

      await abrirLista()
      const items = await screen.findAllByRole("option")
      expect(items.map((i) => i.textContent)).toEqual([
        expect.stringContaining("Ana Gómez"),
        expect.stringContaining("José Pérez"),
      ])
    })

    it("no elige nada solo: hace falta una persona real", async () => {
      const onCambiar = vi.fn()
      render(<ClienteSelector tenantId="vet" seleccionado={null} onCambiar={onCambiar} obligatorio />)

      await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())
      expect(onCambiar).not.toHaveBeenCalled()
      expect(screen.getByText(/elegí un cliente \(obligatorio\)/i)).toBeInTheDocument()
    })

    it("no deja quitar el cliente una vez elegido", async () => {
      render(<ClienteSelector tenantId="vet" seleccionado={ANA} onCambiar={vi.fn()} obligatorio />)
      await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

      expect(screen.queryByRole("button", { name: /quitar cliente/i })).not.toBeInTheDocument()
    })

    it("pero sí deja cambiarlo por otro", async () => {
        const onCambiar = vi.fn()
      render(<ClienteSelector tenantId="vet" seleccionado={ANA} onCambiar={onCambiar} obligatorio />)
      await waitFor(() => expect(getClientesBasic).toHaveBeenCalled())

      await abrirLista()
      fireEvent.click(await screen.findByText("José Pérez"))

      expect(onCambiar).toHaveBeenCalledWith(JOSE)
    })
  })
})
