import { jsPDF } from "jspdf"
import type { Cliente, Mascota, Historia } from "@/lib/firebase/firestore"

/**
 * Genera y descarga un PDF de la libreta sanitaria de una mascota:
 * datos del dueño, datos de la mascota e historial clínico cronológico.
 */
export function generarLibretaPDF(
  cliente: Pick<Cliente, "nombre" | "telefono" | "email" | "dni" | "domicilio">,
  mascota: Pick<Mascota, "nombre" | "tipo" | "raza" | "edad" | "peso">,
  historias: Historia[],
  vetNombre?: string,
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  let y = margin

  const nuevaPaginaSiHaceFalta = (alto: number) => {
    if (y + alto > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  const linea = (texto: string, size = 10, bold = false, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const wrapped = doc.splitTextToSize(texto, pageWidth - margin * 2)
    for (const l of wrapped) {
      nuevaPaginaSiHaceFalta(size + 4)
      doc.text(l, margin, y)
      y += size + 4
    }
  }

  // Encabezado
  doc.setFillColor(16, 185, 129)
  doc.rect(0, 0, pageWidth, 70, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("Libreta Sanitaria", margin, 38)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.text(vetNombre || "VetPanel", margin, 56)
  y = 96

  // Datos de la mascota
  linea("Mascota", 14, true)
  y += 2
  linea(`Nombre: ${mascota.nombre ?? "—"}`)
  linea(`Tipo: ${mascota.tipo ?? "—"}   Raza: ${mascota.raza ?? "—"}`)
  linea(`Edad: ${mascota.edad ?? "—"}   Peso: ${mascota.peso ?? "—"}`)
  y += 8

  // Datos del dueño
  linea("Dueño", 14, true)
  y += 2
  linea(`Nombre: ${cliente.nombre ?? "—"}`)
  linea(`DNI: ${cliente.dni ?? "—"}   Tel: ${cliente.telefono ?? "—"}`)
  linea(`Email: ${cliente.email ?? "—"}`)
  if (cliente.domicilio) linea(`Domicilio: ${cliente.domicilio}`)
  y += 12

  // Historial clínico
  linea("Historial clínico", 14, true)
  y += 4

  if (historias.length === 0) {
    linea("Sin visitas registradas.", 10, false, [100, 116, 139])
  } else {
    const ordenadas = [...historias].sort((a, b) =>
      (b.fechaAtencion ?? "").localeCompare(a.fechaAtencion ?? ""),
    )
    for (const h of ordenadas) {
      nuevaPaginaSiHaceFalta(70)
      const fecha = h.fechaAtencion
        ? new Date(h.fechaAtencion + "T00:00:00").toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "—"
      // Separador
      doc.setDrawColor(226, 232, 240)
      doc.line(margin, y, pageWidth - margin, y)
      y += 14
      linea(`${fecha} — ${h.motivo || "Consulta"}`, 11, true)
      if (h.diagnostico) linea(`Diagnóstico: ${h.diagnostico}`)
      if (h.tratamiento) linea(`Tratamiento: ${h.tratamiento}`)
      if (h.observaciones) linea(`Observaciones: ${h.observaciones}`)
      if (h.proximaVisita) linea(`Próxima visita: ${h.proximaVisita}`, 9, false, [100, 116, 139])
      if (h.archivos?.length) linea(`Adjuntos: ${h.archivos.length}`, 9, false, [100, 116, 139])
      y += 6
    }
  }

  // Pie
  const fechaGen = new Date().toLocaleDateString("es-AR")
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(`Generado el ${fechaGen} · VetPanel`, margin, pageHeight - 24)

  const nombreArchivo = `libreta-${(mascota.nombre ?? "mascota").toLowerCase().replace(/\s+/g, "-")}.pdf`
  doc.save(nombreArchivo)
}
