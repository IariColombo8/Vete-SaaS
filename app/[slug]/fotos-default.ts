/**
 * Fotos de muestra del hero de la página pública, para veterinarias que
 * todavía no subieron las suyas. Viven aparte de la vista (que es un
 * componente de cliente) porque `page.tsx` las necesita en el servidor para
 * precargar la primera, que es la imagen más grande de la página (LCP).
 *
 * Tamaños acotados a lo que se muestra: la de celular se pedía en 3000 px
 * (350 KB) para una pantalla de 400 px.
 */
export const FOTOS_DEFAULT_DESKTOP = [
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1400&q=80",
  "https://www.laclinicaveterinaria.com/wp-content/uploads/2022/02/Captura-de-pantalla-2022-02-02-a-las-13.49.23_resultado-scaled.webp",
]

export const FOTOS_DEFAULT_MOBILE = [
  "https://images.unsplash.com/photo-1510771463146-e89e6e86560e?fm=jpg&q=60&w=900&auto=format&fit=crop&ixlib=rb-4.1.0",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTncqvCAsIT8bP5iYEVJ9VDXejE2HdoqN8hPA&s",
  "https://img.freepik.com/foto-gratis/perro-pequeno-es-adorable_23-2149016873.jpg",
]

/** Primera foto de cada set, respetando el mismo fallback que usa la vista. */
export function primerasFotosHero(config: { fotosHero?: string[]; fotosHeroMobile?: string[] } | null) {
  const desktop = config?.fotosHero?.length ? config.fotosHero : FOTOS_DEFAULT_DESKTOP
  const mobile = config?.fotosHeroMobile?.length ? config.fotosHeroMobile : FOTOS_DEFAULT_MOBILE
  return { desktop: desktop[0] as string | undefined, mobile: mobile[0] as string | undefined }
}
