import { describe, it, expect } from "vitest"
import { FAQS } from "@/lib/landing/faqs"
import { datosEstructuradosLanding, serializarJsonLd } from "./datos-estructurados"

type Nodo = { "@type": string } & Record<string, unknown>

function nodos(): Nodo[] {
  return datosEstructuradosLanding()["@graph"] as Nodo[]
}

describe("datosEstructuradosLanding", () => {
  it("describe la organización, el sitio, la aplicación y las preguntas", () => {
    expect(nodos().map((n) => n["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"])
  })

  it("las preguntas son las mismas que se ven en la landing", () => {
    const faq = nodos().find((n) => n["@type"] === "FAQPage")!
    const preguntas = (faq.mainEntity as { name: string }[]).map((p) => p.name)
    expect(preguntas).toEqual(FAQS.map((f) => f.q))
  })

  it("vincula a ServiTec con su perfil de Google Maps", () => {
    const org = nodos().find((n) => n["@type"] === "Organization")!
    expect(org.parentOrganization).toMatchObject({
      name: "ServiTec",
      sameAs: ["https://maps.app.goo.gl/HqguXzHvLLCMghW8A"],
    })
  })

  // Reseñas sin respaldo verificable pueden traer una penalización manual de Google.
  it("no publica valoraciones ni reseñas", () => {
    const texto = JSON.stringify(datosEstructuradosLanding())
    expect(texto).not.toContain("aggregateRating")
    expect(texto).not.toContain("Review")
  })
})

describe("serializarJsonLd", () => {
  it("escapa < para que un texto no pueda cerrar el <script>", () => {
    const salida = serializarJsonLd({ name: "</script><script>alert(1)</script>" })
    expect(salida).not.toContain("</script>")
    expect(JSON.parse(salida).name).toBe("</script><script>alert(1)</script>")
  })
})
