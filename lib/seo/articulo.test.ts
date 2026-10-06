import { describe, it, expect } from "vitest"
import { datosEstructuradosArticulo } from "./articulo"

const BASE = "https://www.vetpanel.com.ar"
const post = {
  slug: "reducir-ausencias-turnos",
  title: "5 formas de reducir las ausencias en los turnos",
  description: "Consejos prácticos",
  date: "2026-05-10",
  author: "Equipo VetPanel",
}

describe("datosEstructuradosArticulo", () => {
  it("arma un BlogPosting con título, fecha, autor y editor", () => {
    expect(datosEstructuradosArticulo(post, BASE)).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${BASE}/blog/reducir-ausencias-turnos#articulo`,
      headline: post.title,
      description: post.description,
      url: `${BASE}/blog/reducir-ausencias-turnos`,
      mainEntityOfPage: `${BASE}/blog/reducir-ausencias-turnos`,
      datePublished: "2026-05-10",
      inLanguage: "es-AR",
      image: `${BASE}/metadato.png`,
      author: { "@type": "Organization", name: "Equipo VetPanel", url: BASE },
      publisher: { "@id": `${BASE}/#organizacion` },
    })
  })

  it("un autor con nombre propio firma como persona", () => {
    expect(datosEstructuradosArticulo({ ...post, author: "Dra. Ana Pérez" }, BASE).author).toEqual({
      "@type": "Person",
      name: "Dra. Ana Pérez",
    })
  })

  it("sin autor, firma la organización; sin fecha válida, no publica datePublished", () => {
    const d = datosEstructuradosArticulo({ ...post, author: undefined, date: "pronto" }, BASE)
    expect(d.author).toEqual({ "@type": "Organization", name: "VetPanel", url: BASE })
    expect(d).not.toHaveProperty("datePublished")
  })
})
