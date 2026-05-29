import type { Metadata } from "next"
import { getLibretaPublica } from "@/lib/firebase/firestore"
import { PawPrint, Stethoscope } from "lucide-react"

interface Props {
  params: Promise<{ slug: string; token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, token } = await params
  const libreta = await getLibretaPublica(slug, token).catch(() => null)
  const titulo = libreta ? `Libreta sanitaria de ${libreta.mascota.nombre}` : "Libreta sanitaria"
  return { title: titulo, robots: { index: false, follow: false } }
}

export default async function LibretaPublicaPage({ params }: Props) {
  const { slug, token } = await params
  const libreta = await getLibretaPublica(slug, token).catch(() => null)

  if (!libreta) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <PawPrint className="h-12 w-12 text-slate-300 dark:text-slate-700" />
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Libreta no encontrada</p>
        <p className="text-sm text-slate-500">El enlace puede estar vencido o ser incorrecto.</p>
      </main>
    )
  }

  const { mascota, historias, vetNombre, generadoEl } = libreta

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl overflow-hidden shadow-lg bg-white dark:bg-slate-900">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="h-5 w-5" />
              <span className="text-sm opacity-90">{vetNombre || "VetPanel"}</span>
            </div>
            <h1 className="text-2xl font-bold">Libreta sanitaria</h1>
            <p className="opacity-90 mt-1">
              {mascota.nombre} · {mascota.tipo}
              {mascota.raza ? ` · ${mascota.raza}` : ""}
              {mascota.edad ? ` · ${mascota.edad}` : ""}
            </p>
          </div>

          <div className="p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
              Historial clínico
            </h2>
            {historias.length === 0 ? (
              <p className="text-sm text-slate-500">Sin visitas registradas.</p>
            ) : (
              <ol className="relative border-l border-slate-200 dark:border-slate-700 space-y-5 pl-5">
                {historias.map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {h.fecha
                        ? new Date(h.fecha + "T00:00:00").toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{h.motivo}</p>
                    {h.diagnostico && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        <span className="font-medium">Diagnóstico:</span> {h.diagnostico}
                      </p>
                    )}
                    {h.tratamiento && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Tratamiento:</span> {h.tratamiento}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="px-6 pb-6">
            <p className="text-[10px] text-slate-400 text-center">
              Generado el {new Date(generadoEl).toLocaleDateString("es-AR")} · VetPanel
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
