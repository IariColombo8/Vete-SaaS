import Link from "next/link"
import { Stethoscope } from "lucide-react"

/**
 * 404 real para `/{slug}` cuando la veterinaria no existe. Antes la página
 * respondía 200 con "Veterinaria no encontrada" renderizado en el cliente
 * (un soft 404 para Google, que además hacía una consulta a Supabase por cada
 * URL inventada, incluidos archivos estáticos que no existen). Mismo diseño
 * que tenía esa pantalla, sin JavaScript.
 */
export default function VeterinariaNoEncontrada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-4">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-900">
        <Stethoscope className="h-10 w-10 text-slate-700" />
      </div>
      <div className="text-center">
        <h1 className="mb-1 text-xl font-bold text-white">Veterinaria no encontrada</h1>
        <p className="text-sm text-slate-400">El enlace puede estar incorrecto o la veterinaria ya no existe.</p>
      </div>
      <Link
        href="/"
        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
