import type { RedesSociales } from "@/lib/supabase/types"

/**
 * Redes sociales de la veterinaria. Se guarda lo que escribió el dueño (un
 * link o "@usuario"); estas funciones lo llevan a un link que abre la red y
 * al "@usuario" que se muestra. Testeado en `redes.test.ts`.
 */

export type RedSocial = keyof RedesSociales

const DOMINIO: Record<RedSocial, string> = {
  instagram: "instagram.com",
  facebook: "facebook.com",
}

export const NOMBRE_RED: Record<RedSocial, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
}

export const REDES: RedSocial[] = ["instagram", "facebook"]

/**
 * Usuario de la red a partir de lo que se haya pegado: "@vipvet", "vipvet",
 * "instagram.com/vipvet" o "https://www.instagram.com/vipvet/?hl=es".
 * null si no se reconoce (un link de otra red, texto con espacios…).
 */
export function usuarioRed(red: RedSocial, valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim()
  if (!v) return null
  const dominio = DOMINIO[red].replace(".", "\\.")
  const link = v.match(new RegExp(`^(?:https?://)?(?:[\\w-]+\\.)?${dominio}/([^/?#\\s]+)`, "i"))
  const usuario = link ? link[1] : v.replace(/^@/, "")
  return /^[\w.-]+$/.test(usuario) ? usuario : null
}

/** Link que abre el perfil, o null si el valor no sirve. */
export function urlRed(red: RedSocial, valor: string | null | undefined): string | null {
  const usuario = usuarioRed(red, valor)
  return usuario ? `https://www.${DOMINIO[red]}/${usuario}/` : null
}

/** Solo las redes cargadas y válidas, en el orden de `REDES`. */
export function redesConLink(redes: RedesSociales | undefined): { red: RedSocial; url: string; usuario: string }[] {
  return REDES.flatMap((red) => {
    const usuario = usuarioRed(red, redes?.[red])
    return usuario ? [{ red, usuario, url: `https://www.${DOMINIO[red]}/${usuario}/` }] : []
  })
}
