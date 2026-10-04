import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Ayuda } from "./ayuda"
import { TEXTOS_AYUDA } from "@/lib/ayuda/textos"

describe("Ayuda", () => {
  it("muestra un botón accesible con el nombre del tema", () => {
    render(<Ayuda tema="caja.arqueo" />)
    expect(screen.getByRole("button", { name: "Ayuda: Arqueo" })).toBeInTheDocument()
  })

  it("abre el texto del tema al hacer click", () => {
    render(<Ayuda tema="caja.arqueo" />)
    fireEvent.click(screen.getByRole("button", { name: "Ayuda: Arqueo" }))
    expect(screen.getByText(TEXTOS_AYUDA["caja.arqueo"].texto)).toBeInTheDocument()
  })

  // Va pegado a los <Label> de formularios: si fuera type="submit" (el default
  // de <button>), tocar el "?" mandaría el formulario.
  it("no envía el formulario que lo contiene", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Ayuda tema="caja.arqueo" />
      </form>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Ayuda: Arqueo" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Muchos labels envuelven al control (<label><span/><Switch/></label>): un
  // click que burbujea hasta el label activaría el switch de al lado.
  it("no propaga el click al label que lo envuelve", () => {
    const onLabelClick = vi.fn()
    render(
      <label onClick={onLabelClick}>
        Comprar <Ayuda tema="sorteos.chances" />
      </label>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Ayuda: Chances del sorteo" }))
    expect(onLabelClick).not.toHaveBeenCalled()
  })

  it("todos los temas tienen título y texto", () => {
    for (const { titulo, texto } of Object.values(TEXTOS_AYUDA)) {
      expect(titulo.trim()).not.toBe("")
      expect(texto.trim()).not.toBe("")
    }
  })
})
