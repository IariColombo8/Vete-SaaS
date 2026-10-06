import { describe, it, expect } from "vitest"
import { datosEstructuradosVeterinaria, horariosAEspecificacion } from "./veterinaria"
import type { TenantConfig } from "@/lib/supabase/types"

const BASE = "https://www.vetpanel.com.ar"

describe("horariosAEspecificacion", () => {
  it("expande un rango de días a sus nombres en schema.org", () => {
    const r = horariosAEspecificacion([{ dia: "Lunes a Viernes", apertura: "09:00", cierre: "18:00", cerrado: false }])
    expect(r).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "18:00",
      },
    ])
  })

  it("parte el horario con siesta en dos bloques", () => {
    const r = horariosAEspecificacion([
      { dia: "Sabado", apertura: "09:00", cierre: "20:00", cerrado: false, corrido: false, cierre1: "13:00", apertura2: "16:00" },
    ])
    expect(r.map((e) => [e.opens, e.closes])).toEqual([["09:00", "13:00"], ["16:00", "20:00"]])
    expect(r[0].dayOfWeek).toEqual(["Saturday"])
  })

  it("publica el cierre a medianoche como 23:59, que es lo que acepta Google", () => {
    const r = horariosAEspecificacion([{ dia: "Viernes", apertura: "21:00", cierre: "24:00", cerrado: false }])
    expect(r[0].closes).toBe("23:59")
  })

  it("omite días cerrados, días que no se pueden leer y horas mal escritas", () => {
    const r = horariosAEspecificacion([
      { dia: "Domingo", apertura: "09:00", cierre: "13:00", cerrado: true },
      { dia: "Feriados", apertura: "09:00", cierre: "13:00", cerrado: false },
      { dia: "Lunes", apertura: "9", cierre: "", cerrado: false },
    ])
    expect(r).toEqual([])
  })
})

describe("datosEstructuradosVeterinaria", () => {
  const config: TenantConfig = {
    nombre: "VipVet",
    descripcion: "Clínica veterinaria",
    telefono: "+54 9 3442 123456",
    email: "hola@vipvet.com",
    direccion: "San Martín 123",
    ciudad: "Concepción del Uruguay",
    logo: "https://cdn.example/logo.png",
    fotosHero: ["https://cdn.example/hero.jpg"],
    googleMapsUrl: "https://maps.google.com/?q=vipvet",
    servicios: [{ emoji: "💉", nombre: "Vacunación", descripcion: "Plan completo" }],
    horarios: [{ dia: "Lunes", apertura: "09:00", cierre: "18:00", cerrado: false }],
  }

  it("arma un VeterinaryCare con los datos de la veterinaria", () => {
    const d = datosEstructuradosVeterinaria("vipvet", config, BASE)
    expect(d).toMatchObject({
      "@context": "https://schema.org",
      "@type": "VeterinaryCare",
      "@id": `${BASE}/vipvet/#veterinaria`,
      name: "VipVet",
      url: `${BASE}/vipvet`,
      description: "Clínica veterinaria",
      telephone: "+54 9 3442 123456",
      email: "hola@vipvet.com",
      logo: "https://cdn.example/logo.png",
      image: ["https://cdn.example/hero.jpg"],
      hasMap: "https://maps.google.com/?q=vipvet",
      address: {
        "@type": "PostalAddress",
        streetAddress: "San Martín 123",
        addressLocality: "Concepción del Uruguay",
        addressCountry: "AR",
      },
      potentialAction: { "@type": "ReserveAction", target: `${BASE}/vipvet/turno` },
    })
    expect(d.openingHoursSpecification).toHaveLength(1)
    expect(d.makesOffer).toEqual([
      {
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: "Vacunación", description: "Plan completo" },
      },
    ])
  })

  it("no publica campos vacíos: Google marca error con valores en blanco", () => {
    const d = datosEstructuradosVeterinaria("nueva", { nombre: "Nueva", telefono: "  ", horarios: [] }, BASE)
    expect(d).not.toHaveProperty("telephone")
    expect(d).not.toHaveProperty("address")
    expect(d).not.toHaveProperty("openingHoursSpecification")
    expect(d).not.toHaveProperty("makesOffer")
    expect(d).not.toHaveProperty("image")
    expect(d.name).toBe("Nueva")
  })

  it("usa el logo como imagen si no hay fotos, y el slug si no hay nombre", () => {
    const d = datosEstructuradosVeterinaria("sin-nombre", { logo: "https://cdn.example/l.png" }, BASE)
    expect(d.image).toEqual(["https://cdn.example/l.png"])
    expect(d.name).toBe("sin-nombre")
  })
})
