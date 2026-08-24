import { describe, expect, it } from "vitest"
import type { Venta, VentaItem } from "@/lib/supabase/types"
import {
  generarRemitoPDF,
  linkWhatsApp,
  mensajeWhatsApp,
  nombreArchivoRemito,
  numeroFormateado,
  telefonoWhatsApp,
} from "./remito"

function item(over: Partial<VentaItem> = {}): VentaItem {
  return {
    nombre: "Adulto Mediano",
    marca: "Royal Canin",
    presentacion: "15 kg",
    unidad: "un",
    cantidad: 1,
    precioUnitario: 45000,
    subtotal: 45000,
    ...over,
  }
}

function venta(over: Partial<Venta> = {}): Venta {
  return {
    id: "v1",
    numero: 42,
    clienteNombre: "Juan Pérez",
    clienteTelefono: "3541 555123",
    clienteDni: "28.456.789",
    clienteDomicilio: "Belgrano 450, Cosquín",
    medioPago: "efectivo",
    estado: "completada",
    subtotal: 45000,
    descuento: 0,
    total: 45000,
    observaciones: "",
    createdAt: "2026-08-23T15:30:00.000Z",
    items: [item()],
    ...over,
  }
}

const emisor = {
  nombre: "Veterinaria Priscila",
  direccion: "Av. San Martín 123",
  telefono: "3541 400000",
}

describe("generarRemitoPDF", () => {
  it("genera un PDF no vacío", () => {
    const salida = generarRemitoPDF(venta(), emisor).output("arraybuffer")

    expect(salida.byteLength).toBeGreaterThan(1000)
  })

  it("una venta sin items no rompe la generación", () => {
    expect(() => generarRemitoPDF(venta({ items: [] }), emisor)).not.toThrow()
  })

  it("una venta sin el detalle cargado no rompe la generación", () => {
    expect(() => generarRemitoPDF(venta({ items: undefined }), emisor)).not.toThrow()
  })

  it("dibuja el sello de anulada sin romperse", () => {
    // `setGState` es una extensión de jsPDF: si falta, esto explota.
    expect(() =>
      generarRemitoPDF(venta({ estado: "anulada", anuladaAt: "2026-08-24" }), emisor),
    ).not.toThrow()
  })

  it("pagina cuando el detalle no entra en una hoja", () => {
    const muchos = Array.from({ length: 60 }, (_, i) =>
      item({ nombre: `Producto ${i}`, presentacion: "" }),
    )
    const doc = generarRemitoPDF(venta({ items: muchos }), emisor)

    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it("un emisor mínimo (solo nombre) alcanza", () => {
    expect(() => generarRemitoPDF(venta(), { nombre: "Vet" })).not.toThrow()
  })

  it("muestra el bloque de descuento cuando lo hay", () => {
    expect(() =>
      generarRemitoPDF(venta({ descuento: 5000, total: 40000 }), emisor),
    ).not.toThrow()
  })

  it("un nombre de producto larguísimo no rompe el layout", () => {
    const largo = item({ nombre: "A".repeat(300) })

    expect(() => generarRemitoPDF(venta({ items: [largo] }), emisor)).not.toThrow()
  })

  /**
   * El nombre del producto y la cantidad viven en columnas contiguas: el nombre
   * fluye hacia la derecha y la cantidad va alineada a la derecha, así que
   * crecen una contra la otra. Este test fija la separación mínima — sin él, un
   * cambio de columnas encima los dos textos y nadie se entera hasta imprimir.
   */
  it("la descripción recortada nunca alcanza a la columna de precio", () => {
    const doc = generarRemitoPDF(venta(), emisor)

    // Mismas medidas que `marcoDe` para una hoja A4 (MARGEN 40, PAD 14).
    const der = doc.internal.pageSize.getWidth() - 40
    const xImporte = der - 14
    const xPrecio = xImporte - 84
    const xDescripcion = 40 + 14 + 62
    const finDescripcion = xPrecio - 78 - 10

    // La fuente se fija ANTES de partir el texto: `splitTextToSize` mide con la
    // activa, así que medir con otra distinta invalida todo el cálculo.
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)

    const titulo = "Royal Canin Adulto Mediano Raza Grande Pollo y Arroz Premium Extra Large"
    const [recortado] = doc.splitTextToSize(titulo, finDescripcion - xDescripcion)

    expect(xDescripcion + doc.getTextWidth(recortado)).toBeLessThanOrEqual(finDescripcion)
  })
})

describe("numeroFormateado y nombreArchivoRemito", () => {
  it("usa el formato de comprobante argentino: punto de venta y 8 dígitos", () => {
    expect(numeroFormateado({ numero: 42 })).toBe("0001-00000042")
    expect(nombreArchivoRemito({ numero: 42 })).toBe("Remito-0001-00000042.pdf")
  })

  it("no recorta un número que ya ocupa los ocho dígitos", () => {
    expect(numeroFormateado({ numero: 12345678 })).toBe("0001-12345678")
  })
})

describe("datos faltantes del cliente", () => {
  it("una venta a consumidor final sin ningún dato no rompe el remito", () => {
    const anonima = venta({
      clienteNombre: "",
      clienteTelefono: "",
      clienteDni: "",
      clienteDomicilio: "",
    })

    expect(() => generarRemitoPDF(anonima, emisor)).not.toThrow()
  })

  it("un domicilio larguísimo se recorta en vez de desbordar", () => {
    const largo = venta({ clienteDomicilio: "Av. Siempreviva ".repeat(30) })

    expect(() => generarRemitoPDF(largo, emisor)).not.toThrow()
  })
})

describe("telefonoWhatsApp", () => {
  it("antepone el 54 a un número local", () => {
    expect(telefonoWhatsApp("3541 555123")).toBe("543541555123")
  })

  it("saca el 0 de larga distancia", () => {
    expect(telefonoWhatsApp("03541555123")).toBe("543541555123")
  })

  it("respeta el número que ya viene con código de país", () => {
    expect(telefonoWhatsApp("+54 9 3541 555123")).toBe("5493541555123")
  })

  it("devuelve null cuando no hay número usable", () => {
    expect(telefonoWhatsApp("")).toBeNull()
    expect(telefonoWhatsApp(undefined)).toBeNull()
    expect(telefonoWhatsApp("123")).toBeNull()
  })
})

describe("mensajeWhatsApp y linkWhatsApp", () => {
  it("incluye el total y el número de remito", () => {
    const texto = mensajeWhatsApp(venta(), emisor)

    expect(texto).toContain("Juan Pérez")
    expect(texto).toContain("Royal Canin")
    expect(texto).toContain("00042")
  })

  it("saluda genéricamente al consumidor final", () => {
    expect(mensajeWhatsApp(venta({ clienteNombre: "" }), emisor)).toContain("¡Hola!")
  })

  it("arma el link con el destinatario cuando hay teléfono", () => {
    expect(linkWhatsApp(venta(), emisor)).toContain("wa.me/543541555123?text=")
  })

  it("sin teléfono abre WhatsApp para que el usuario elija el contacto", () => {
    expect(linkWhatsApp(venta({ clienteTelefono: "" }), emisor)).toContain("wa.me/?text=")
  })
})
