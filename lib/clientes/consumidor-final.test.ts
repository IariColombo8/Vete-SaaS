import { describe, expect, it } from "vitest"
import {
  buscarConsumidorFinal, conConsumidorFinalPrimero, esConsumidorFinal, normalizarTexto,
} from "./consumidor-final"
import type { Cliente } from "@/lib/supabase/types"

const cliente = (nombre: string, id = nombre): Cliente =>
  ({ id, nombre } as Cliente)

describe("normalizarTexto", () => {
  it("saca acentos para que 'jose' encuentre a 'José'", () => {
    expect(normalizarTexto("José Pérez")).toBe("jose perez")
  })

  it("recorta espacios y baja a minúscula", () => {
    expect(normalizarTexto("  MARÍA  ")).toBe("maria")
  })
})

describe("esConsumidorFinal", () => {
  it("reconoce la fila escrita de cualquier forma", () => {
    expect(esConsumidorFinal(cliente("Consumidor Final"))).toBe(true)
    expect(esConsumidorFinal(cliente("consumidor final"))).toBe(true)
    expect(esConsumidorFinal(cliente(" Cliente Final "))).toBe(true)
  })

  it("no confunde a una persona con nombre parecido", () => {
    expect(esConsumidorFinal(cliente("Consumidora Finalia"))).toBe(false)
    expect(esConsumidorFinal(cliente("Juan Pérez"))).toBe(false)
  })

  it("trata la ausencia de cliente como no-consumidor-final", () => {
    expect(esConsumidorFinal(null)).toBe(false)
    expect(esConsumidorFinal(undefined)).toBe(false)
  })
})

describe("buscarConsumidorFinal", () => {
  it("devuelve la fila cuando el tenant la creó", () => {
    const lista = [cliente("Ana"), cliente("Consumidor final"), cliente("Beto")]
    expect(buscarConsumidorFinal(lista)?.nombre).toBe("Consumidor final")
  })

  it("devuelve null cuando no existe", () => {
    expect(buscarConsumidorFinal([cliente("Ana")])).toBeNull()
  })

  it("ante duplicados elige siempre el primero, para no alternar entre recargas", () => {
    const lista = [cliente("Consumidor final", "a"), cliente("CONSUMIDOR FINAL", "b")]
    expect(buscarConsumidorFinal(lista)?.id).toBe("a")
  })
})

describe("conConsumidorFinalPrimero", () => {
  it("lo pone arriba y conserva el orden alfabético del resto", () => {
    const lista = [cliente("Ana"), cliente("Beto"), cliente("Consumidor final"), cliente("Dora")]
    expect(conConsumidorFinalPrimero(lista).map((c) => c.nombre)).toEqual([
      "Consumidor final", "Ana", "Beto", "Dora",
    ])
  })

  it("no altera la lista cuando la fila no existe", () => {
    const lista = [cliente("Ana"), cliente("Beto")]
    expect(conConsumidorFinalPrimero(lista).map((c) => c.nombre)).toEqual(["Ana", "Beto"])
  })
})
