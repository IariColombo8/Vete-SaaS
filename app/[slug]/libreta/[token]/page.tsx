import type { Metadata } from "next"
import { cache } from "react"
import { getLibretaPublica, getTenantConfig } from "@/lib/supabase/queries"
import { getMascotaPublico } from "@/lib/supabase/mascotas"
import { getProximasVacunasPublico, type ProximaVacuna } from "@/lib/supabase/recordatorios-vacuna"
import { diasHasta, fechaArgentina, textoVencimiento } from "@/lib/recordatorios/vacunas"
import { imagenSupabase, srcSetSupabase } from "@/lib/imagenes"
import { telefonoWhatsApp } from "@/lib/telefono"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { SERVITEC } from "@/lib/marca"
import type { LibretaPublica } from "@/lib/supabase/types"
import { BugOff, MapPin, MessageCircle, PawPrint, Phone, ShieldCheck, Stethoscope, Syringe } from "lucide-react"

interface Props {
  params: Promise<{ slug: string; token: string }>
}

// Metadata y página leen la misma libreta: `cache` evita la segunda query por request.
const leerLibreta = cache((slug: string, token: string) => getLibretaPublica(slug, token).catch(() => null))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, token } = await params
  const libreta = await leerLibreta(slug, token)
  const titulo = libreta ? `Libreta sanitaria de ${libreta.mascota.nombre}` : "Libreta sanitaria"
  return { title: titulo, robots: { index: false, follow: false } }
}

function emojiPorTipo(tipo: string): string {
  return MASCOTAS_DEFAULT.find((m) => m.id === tipo)?.emoji ?? "🐾"
}

function nombreTipo(tipo: string): string {
  return MASCOTAS_DEFAULT.find((m) => m.id === tipo)?.nombre ?? tipo
}

function formatFecha(fecha: string): string {
  if (!fecha) return "—"
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

/**
 * El snapshot se congela al generar el QR, pero la foto y los datos generales
 * cambian después (el dueño sube la foto desde Mi historia). Si la mascota
 * sigue existiendo se usan sus datos actuales; si no, los del snapshot.
 * La foto también rescata los QR generados antes de que el snapshot la guardara.
 */
async function mascotaActual(slug: string, libreta: LibretaPublica): Promise<LibretaPublica["mascota"]> {
  if (!libreta.mascotaId) return libreta.mascota
  const viva = await getMascotaPublico(slug, libreta.mascotaId).catch(() => null)
  if (!viva) return libreta.mascota
  return {
    nombre: viva.nombre || libreta.mascota.nombre,
    tipo: viva.tipo || libreta.mascota.tipo,
    raza: viva.raza || libreta.mascota.raza,
    edad: viva.edad || libreta.mascota.edad,
    sexo: viva.sexo ?? libreta.mascota.sexo,
    color: viva.color || libreta.mascota.color,
    castrado: viva.castrado ?? libreta.mascota.castrado,
    tieneChip: viva.tieneChip ?? libreta.mascota.tieneChip,
    fotoUrl: viva.fotoUrl || libreta.mascota.fotoUrl,
  }
}

const ESTILO_PROXIMA: Record<ProximaVacuna["tipo"], { Icon: typeof Syringe; chip: string; label: string }> = {
  vacuna: { Icon: Syringe, chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", label: "Vacuna" },
  desparasitacion: { Icon: BugOff, chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", label: "Desparasitación" },
}

export default async function LibretaPublicaPage({ params }: Props) {
  const { slug, token } = await params
  const libreta = await leerLibreta(slug, token)

  if (!libreta) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <PawPrint className="h-12 w-12 text-slate-300 dark:text-slate-700" />
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Libreta no encontrada</p>
        <p className="text-sm text-slate-500">El enlace puede estar vencido o ser incorrecto.</p>
      </main>
    )
  }

  const [mascota, config, proximas] = await Promise.all([
    mascotaActual(slug, libreta),
    getTenantConfig(slug).catch(() => null),
    libreta.mascotaId
      ? getProximasVacunasPublico(slug, libreta.mascotaId).catch(() => [] as ProximaVacuna[])
      : Promise.resolve([] as ProximaVacuna[]),
  ])
  const { historias, generadoEl } = libreta
  const vetNombre = config?.nombre || libreta.vetNombre || "VetPanel"
  const whatsapp = telefonoWhatsApp(config?.telefono)
  const hoy = fechaArgentina(new Date())

  const datos: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Especie", valor: nombreTipo(mascota.tipo) },
    { etiqueta: "Raza", valor: mascota.raza ?? "" },
    { etiqueta: "Edad", valor: mascota.edad ?? "" },
    { etiqueta: "Sexo", valor: mascota.sexo === "macho" ? "Macho" : mascota.sexo === "hembra" ? "Hembra" : "" },
    { etiqueta: "Color", valor: mascota.color ?? "" },
    {
      etiqueta: "Castrado/a",
      valor: mascota.castrado === true ? "Sí" : mascota.castrado === false ? "No" : "",
    },
  ].filter((d) => d.valor)

  const mensajeEncontrada = encodeURIComponent(
    `Hola, escaneé el QR de ${mascota.nombre} y quería avisarles que está conmigo.`,
  )

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">

      {/* Logo y nombre de la veterinaria ya los dibuja el navbar público (VetNavbar). */}
      <div className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          <Stethoscope className="h-3.5 w-3.5" />
          Libreta sanitaria digital · {vetNombre}
        </p>
        {/* Ficha de la mascota */}
        <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
          <div
            className={`relative bg-gradient-to-br from-emerald-500 to-teal-600 ${
              mascota.fotoUrl ? "aspect-[4/3] sm:aspect-[16/9]" : "h-48"
            }`}
          >
            {mascota.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagenSupabase(mascota.fotoUrl, 1200)}
                srcSet={srcSetSupabase(mascota.fotoUrl, [480, 800, 1200])}
                sizes="(min-width: 672px) 672px, 100vw"
                alt={`Foto de ${mascota.nombre}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="absolute right-6 top-4 text-7xl opacity-90" aria-hidden>
                {emojiPorTipo(mascota.tipo)}
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-5 pt-16">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow">
                {mascota.nombre}
              </h1>
              <p className="mt-0.5 text-sm text-white/90">
                {[nombreTipo(mascota.tipo), mascota.raza].filter(Boolean).join(" · ")}
              </p>
            </div>
            {mascota.tieneChip && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Con microchip
              </span>
            )}
          </div>

          {datos.length > 0 && (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-100 dark:bg-slate-800">
              {datos.map((d) => (
                <div key={d.etiqueta} className="bg-white px-4 py-3 dark:bg-slate-900">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {d.etiqueta}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{d.valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/* Para quien encuentra a la mascota: el QR suele ir en el collar */}
        {(whatsapp || config?.telefono || config?.direccion) && (
          <section className="rounded-3xl bg-emerald-600 p-5 text-white shadow-sm">
            <p className="text-base font-bold">¿Encontraste a {mascota.nombre}?</p>
            <p className="mt-1 text-sm text-emerald-50">
              Su veterinaria es {vetNombre}. Escribiles y ellos avisan a la familia.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}?text=${mensajeEncontrada}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              {config?.telefono && (
                <a
                  href={`tel:${config.telefono.replace(/[^\d+]/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-700/60 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-emerald-700"
                >
                  <Phone className="h-4 w-4" />
                  Llamar
                </a>
              )}
            </div>
            {config?.direccion && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-emerald-50">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {config.direccion}
              </p>
            )}
          </section>
        )}

        {proximas.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Syringe className="h-4 w-4 text-emerald-600" />
              Próximas vacunas
            </h2>
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {proximas.map((p) => {
                const dias = diasHasta(p.fecha, hoy)
                const color =
                  dias < 0
                    ? "text-red-600 dark:text-red-400"
                    : dias <= 7
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-500 dark:text-slate-400"
                const { Icon, chip, label } = ESTILO_PROXIMA[p.tipo] ?? ESTILO_PROXIMA.vacuna
                return (
                  <li key={`${p.vacuna}-${p.fecha}`} className="flex items-center gap-3 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{p.vacuna}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {label} · {formatFecha(p.fecha)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium ${color}`}>{textoVencimiento(p.fecha, hoy)}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Stethoscope className="h-4 w-4 text-emerald-600" />
            Historial clínico
            {historias.length > 0 && (
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {historias.length} {historias.length === 1 ? "atención" : "atenciones"}
              </span>
            )}
          </h2>
          {historias.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Sin visitas registradas.</p>
          ) : (
            <ol className="relative mt-4 space-y-4 border-l border-slate-200 pl-5 dark:border-slate-700">
              {historias.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                  <div className="rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h.motivo}</p>
                      <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {formatFecha(h.fecha)}
                      </span>
                    </div>
                    {h.diagnostico && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">Diagnóstico:</span> {h.diagnostico}
                      </p>
                    )}
                    {h.tratamiento && (
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">Tratamiento:</span> {h.tratamiento}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <p className="text-center text-[11px] text-slate-400">
          Historial actualizado al {new Date(generadoEl).toLocaleDateString("es-AR")} · Libreta digital de VetPanel ·
          Desarrollado por{" "}
          <a href={SERVITEC.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-slate-600 hover:underline">
            {SERVITEC.nombre}
          </a>
        </p>
      </div>
    </main>
  )
}
