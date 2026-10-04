"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SERVITEC } from "@/lib/marca"

/**
 * Las rutas de `/[slug]` que ya tienen su propio pie, o donde no corresponde:
 * la página principal (footer completo en vet-public-view), la libreta pública
 * (lleva la firma adentro de la tarjeta), y el panel y el onboarding, que son
 * internos de la veterinaria.
 */
export function llevaPie(pathname: string, slug: string): boolean {
  const resto = pathname.slice(`/${slug}`.length)
  if (resto === "" || resto === "/") return false
  return !/^\/(admin|onboarding|libreta)(\/|$)/.test(resto)
}

/**
 * Pie chico para las páginas públicas internas de cada veterinaria (reservar
 * turno, productos, mi historia, área del cliente). Discreto a propósito: la
 * protagonista es la veterinaria, esto es una firma.
 */
export function PieVetPanel({ slug }: { slug: string }) {
  const pathname = usePathname()
  if (!llevaPie(pathname, slug)) return null

  return (
    <footer className="border-t border-border/60 bg-background/80 px-4 py-5 text-center text-xs text-muted-foreground">
      Página hecha con{" "}
      <Link href="/" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
        VetPanel
      </Link>
      <span aria-hidden> · </span>
      Desarrollado por{" "}
      <a
        href={SERVITEC.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-foreground/80 hover:text-foreground hover:underline"
      >
        {SERVITEC.nombre}
      </a>
    </footer>
  )
}
