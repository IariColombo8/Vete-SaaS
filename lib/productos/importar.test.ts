import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx-js-style"
import { parsearFilas, limpiarMarca, detectarPesoKg } from "./importar"

function workbookDeFilas(filas: (string | number)[][]): XLSX.WorkBook {
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja, "Hoja1")
  return wb
}

describe("parsearFilas", () => {
  it("mapea código, descripción, marca y costo por columna fija", () => {
    const wb = workbookDeFilas([
      ["Encabezado A", "Encabezado B", "Encabezado C", "Encabezado D"],
      ["A001", "Amoxidal 500mg", "Bagó", "1250.50"],
    ])

    const filas = parsearFilas(wb, "Medicamentos", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      numeroFila: 2,
      codigo: "A001",
      descripcion: "Amoxidal 500mg",
      marca: "Bagó",
      categoria: "Medicamentos",
      costo: 1250.5,
      precio: 1250.5,
      barra: "",
      stock: 0,
      revisar: false,
      advertencias: [],
    })
  })

  it("descarta una fila sin descripción y sin código", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["", "", "", ""],
      ["", "", "", "1000"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas).toHaveLength(0)
  })

  it("marca advertencia cuando el costo es cero, pero no descarta la fila", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A002", "Correa de cuero", "", "0"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0].advertencias).toContain("precio en cero")
  })

  it("marca advertencia cuando falta el código, pero no cuando falta la marca", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["", "Pelota de goma", "", "500"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0].advertencias).toEqual(["sin código"])
    expect(filas[0].marca).toBe("")
  })

  it("respeta la fila de inicio", () => {
    const wb = workbookDeFilas([
      ["Logo del proveedor"],
      ["Encabezado A", "Encabezado B", "Encabezado C", "Encabezado D"],
      ["A003", "Shampoo antipulgas", "Vetnil", "800"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 3)

    expect(filas).toHaveLength(1)
    expect(filas[0].numeroFila).toBe(3)
    expect(filas[0].codigo).toBe("A003")
  })

  it("interpreta el separador de miles y coma decimal en el costo", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A004", "Alimento 15kg", "Royal Canin", "$ 45.990,50"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas[0].costo).toBeCloseTo(45990.5)
    expect(filas[0].precio).toBeCloseTo(45990.5)
  })

  it("acepta un precio con puntos de miles y sin parte decimal (formato General de Excel)", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A005", "Bolsa de alimento 20kg", "Eukanuba", "$ 1.080.000"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas[0].costo).toBe(1080000)
    expect(filas[0].advertencias).not.toContain("precio en cero")
  })

  it("acepta un precio en formato estadounidense (coma de miles, punto decimal)", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A006", "Vacuna quíntuple", "Zoetis", "1,200.50"],
    ])

    const filas = parsearFilas(wb, "Medicamentos", 2)

    expect(filas[0].costo).toBeCloseTo(1200.5)
  })

  it("acepta un precio entero sin ningún separador", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A007", "Antiparasitario", "Bayer", "1200"],
    ])

    const filas = parsearFilas(wb, "Medicamentos", 2)

    expect(filas[0].costo).toBe(1200)
    expect(filas[0].advertencias).not.toContain("precio en cero")
  })

  it("acepta un precio con dos decimales separados por punto", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A008", "Collar antipulgas", "Seresto", "899.90"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 2)

    expect(filas[0].costo).toBeCloseTo(899.9)
  })

  it("limpia la marca y detecta el peso en una fila de alimento", () => {
    const wb = workbookDeFilas([
      ["COD", "DESCRIP", "MARCA", "VETER"],
      ["12080105", "HANDLER GATOS ADULTOS  X 10 KG HANDLER ", "APM FOOD *", "$ 30,568.94"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      marca: "APM FOOD",
      unidad: "un",
      pesoKg: 10,
      advertencias: [],
      revisar: false,
    })
  })

  it("marca advertencia cuando un alimento no trae peso detectable", () => {
    const wb = workbookDeFilas([
      ["COD", "DESCRIP", "MARCA", "VETER"],
      ["9999", "Snack sin presentación clara", "AUKI", "1000"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas[0].pesoKg).toBeUndefined()
    expect(filas[0].advertencias).toContain("sin peso detectado")
  })

  it("no exige peso detectado fuera de la categoría Alimentos", () => {
    const wb = workbookDeFilas([
      ["COD", "DESCRIP", "MARCA", "VETER"],
      ["A001", "Amoxidal 500mg", "Bagó", "1250.50"],
    ])

    const filas = parsearFilas(wb, "Medicamentos", 2)

    expect(filas[0].pesoKg).toBeUndefined()
    expect(filas[0].advertencias).not.toContain("sin peso detectado")
  })
})

describe("limpiarMarca", () => {
  it("quita el asterisco final y los espacios", () => {
    expect(limpiarMarca("APM FOOD *")).toBe("APM FOOD")
    expect(limpiarMarca("GARAY S.R.L *")).toBe("GARAY S.R.L")
  })

  it("no toca una marca sin asterisco", () => {
    expect(limpiarMarca("AUKI")).toBe("AUKI")
    expect(limpiarMarca("Bagó")).toBe("Bagó")
  })

  it("recorta espacios sueltos aunque no haya asterisco", () => {
    expect(limpiarMarca("  GOLOCAN  ")).toBe("GOLOCAN")
  })

  it("devuelve string vacío si no hay marca", () => {
    expect(limpiarMarca("")).toBe("")
    expect(limpiarMarca("   ")).toBe("")
  })
})

describe("detectarPesoKg", () => {
  it("detecta kilos enteros", () => {
    expect(detectarPesoKg("HANDLER GATOS ADULTOS X 10 KG HANDLER")).toBe(10)
    expect(detectarPesoKg("MONTAÑES PERROS ADULTOS X 20 KG MONTAÑES")).toBe(20)
  })

  it("convierte gramos a kilos", () => {
    expect(detectarPesoKg("BISCUITS DE POLLO HORNEADOS X 120 GR ")).toBe(0.12)
    expect(detectarPesoKg("AUKI BOCADITOS CAJA DOYPACKS 9 UNID X 500 GRS")).toBe(0.5)
  })

  it("acepta GR con punto final", () => {
    expect(detectarPesoKg("BOCADITOS FINOS X 100 GR. CARNE/POLLO/CHOCOLATE")).toBe(0.1)
  })

  it("usa la última coincidencia si el patrón aparece más de una vez", () => {
    expect(detectarPesoKg("ARGENTO PERRO ADULTO MORDIDA PEQ. X 15 KG ARGENTO X 1 KG")).toBe(1)
  })

  it("devuelve undefined si no hay patrón de peso", () => {
    expect(detectarPesoKg("Amoxidal 500mg")).toBeUndefined()
    expect(detectarPesoKg("Correa de cuero")).toBeUndefined()
    expect(detectarPesoKg("")).toBeUndefined()
  })

  it("interpreta el punto como separador de miles cuando la unidad es gramos", () => {
    expect(detectarPesoKg("BOLSA GRANDE X 1.000 GRS")).toBe(1)
  })

  it("detecta el peso sin la palabra X delante", () => {
    expect(detectarPesoKg("VITALFUN ARENA AGLOM. CARBON ACTIVADO 6 KG VITALFUN")).toBe(6)
    expect(detectarPesoKg("VITALFUN ARENA AGLOM. NEUTRO 12 KG VITALFUN")).toBe(12)
  })

  it("detecta gramos en 'g' minúscula sin la palabra X delante", () => {
    expect(detectarPesoKg("THERAPY RECOVERY WET CANINE 85 g (x 12 u)")).toBe(0.085)
    expect(detectarPesoKg("THERAPY RECOVERY WET FELINE 340 g (x 6 u)")).toBe(0.34)
  })

  it("no confunde la cantidad de unidades por caja (x 12 u) con un peso", () => {
    expect(detectarPesoKg("SOBRES SURTIDOS (x 12 u)")).toBeUndefined()
  })
})
