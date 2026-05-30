import type { Turno } from "@/lib/firebase/firestore"

/** Escapa un valor para CSV (comillas dobles + envoltura si hace falta). */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const HEADERS = [
  "Fecha",
  "Hora",
  "Cliente",
  "DNI",
  "Telefono",
  "Email",
  "Mascota",
  "Tipo",
  "Servicio",
  "Profesional",
  "Estado",
  "DuracionMin",
]

/** Convierte una lista de turnos a una fila CSV cada uno. */
export function turnosToCSV(turnos: Turno[]): string {
  const rows = turnos.map((t) =>
    [
      t.turno?.fecha ?? t.fecha ?? "",
      t.turno?.hora ?? t.hora ?? "",
      t.cliente?.nombre ?? "",
      t.cliente?.dni ?? "",
      t.cliente?.telefono ?? "",
      t.cliente?.email ?? "",
      t.mascota?.nombre ?? "",
      t.mascota?.tipo ?? "",
      t.servicio ?? "",
      t.profesionalNombre ?? "",
      t.estado ?? "",
      t.duracionMin ?? 60,
    ]
      .map(csvCell)
      .join(","),
  )
  return [HEADERS.join(","), ...rows].join("\r\n")
}

/**
 * Genera y descarga un CSV de turnos. Opcionalmente filtra por rango de fechas
 * (YYYY-MM-DD) para exportar, por ejemplo, un mes contable.
 */
export function descargarTurnosCSV(
  turnos: Turno[],
  opts?: { desde?: string; hasta?: string; nombreArchivo?: string },
): void {
  let lista = turnos
  if (opts?.desde) lista = lista.filter((t) => (t.turno?.fecha ?? t.fecha ?? "") >= opts.desde!)
  if (opts?.hasta) lista = lista.filter((t) => (t.turno?.fecha ?? t.fecha ?? "") <= opts.hasta!)

  // BOM para que Excel reconozca UTF-8 (acentos).
  const csv = "﻿" + turnosToCSV(lista)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = opts?.nombreArchivo ?? `turnos-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
