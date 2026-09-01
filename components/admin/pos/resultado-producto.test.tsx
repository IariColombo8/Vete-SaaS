import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ResultadoProducto } from "./buscador-productos"
import type { Producto } from "@/lib/supabase/types"

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function producto(over: Partial<Producto> = {}): Producto {
  return {
    id: "p1",
    nombre: "Arnés Premium",
    descripcion: "",
    categoria: "Accesorios",
    precio: 5000,
    precioLista: 5000,
    stock: 10,
    stockMinimo: 0,
    controlaStock: true,
    unidad: "un",
    ofertaActiva: false,
    ofertaValor: 0,
    activo: true,
    revisar: false,
    publicadoEnLanding: false,
    ...over,
  }
}

/**
 * El selector "-" cantidad "+" del buscador: la cantidad que muestra es la
 * que ya está en el carrito (arranca en 0), no un contador propio a confirmar
 * aparte — clickear "+"/"-" tiene que reflejarse en el número al instante.
 */
describe("ResultadoProducto — selector de cantidad", () => {
  it("arranca en 0 cuando el producto todavía no está en el carrito", () => {
    render(<ResultadoProducto producto={producto()} cantidadEnCarrito={0} onSumar={vi.fn()} onRestar={vi.fn()} />)
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("muestra la cantidad real que ya tiene la línea en el carrito", () => {
    render(<ResultadoProducto producto={producto()} cantidadEnCarrito={3} onSumar={vi.fn()} onRestar={vi.fn()} />)
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("tocar '+' llama a onSumar", () => {
    const onSumar = vi.fn()
    render(<ResultadoProducto producto={producto()} cantidadEnCarrito={0} onSumar={onSumar} onRestar={vi.fn()} />)
    fireEvent.click(screen.getByLabelText("Agregar una unidad al carrito"))
    expect(onSumar).toHaveBeenCalledTimes(1)
  })

  it("tocar '-' llama a onRestar", () => {
    const onRestar = vi.fn()
    render(<ResultadoProducto producto={producto()} cantidadEnCarrito={2} onSumar={vi.fn()} onRestar={onRestar} />)
    fireEvent.click(screen.getByLabelText("Sacar una unidad del carrito"))
    expect(onRestar).toHaveBeenCalledTimes(1)
  })

  it("'-' está deshabilitado en 0: no hay nada que sacar", () => {
    render(<ResultadoProducto producto={producto()} cantidadEnCarrito={0} onSumar={vi.fn()} onRestar={vi.fn()} />)
    expect(screen.getByLabelText("Sacar una unidad del carrito")).toBeDisabled()
  })

  it("tocar el nombre del producto también suma (no hace falta apuntar al +)", () => {
    const onSumar = vi.fn()
    render(<ResultadoProducto producto={producto()} cantidadEnCarrito={0} onSumar={onSumar} onRestar={vi.fn()} />)
    fireEvent.click(screen.getByText("Arnés Premium"))
    expect(onSumar).toHaveBeenCalledTimes(1)
  })

  it("sin stock, el botón '+' queda deshabilitado (no se puede agregar)", () => {
    const onSumar = vi.fn()
    render(
      <ResultadoProducto
        producto={producto({ stock: 0 })}
        cantidadEnCarrito={0}
        onSumar={onSumar}
        onRestar={vi.fn()}
      />,
    )
    const boton = screen.getByLabelText("Agregar una unidad al carrito")
    expect(boton).toBeDisabled()
    fireEvent.click(boton)
    expect(onSumar).not.toHaveBeenCalled()
  })

  it("sin stock, tocar el nombre del producto avisa por toast en vez de agregar", async () => {
    const { toast } = await import("sonner")
    const onSumar = vi.fn()
    render(
      <ResultadoProducto
        producto={producto({ stock: 0 })}
        cantidadEnCarrito={0}
        onSumar={onSumar}
        onRestar={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText("Arnés Premium"))
    expect(onSumar).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("No hay stock"))
  })

  it("no muestra el selector +/- para productos fraccionados por kg (usan el diálogo de cantidad)", () => {
    render(
      <ResultadoProducto
        producto={producto({ unidad: "kg" })}
        cantidadEnCarrito={0}
        onSumar={vi.fn()}
        onRestar={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText("Agregar una unidad al carrito")).not.toBeInTheDocument()
  })
})
