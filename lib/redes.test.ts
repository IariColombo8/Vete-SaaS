import { describe, expect, it } from "vitest"
import { redesConLink, urlRed, usuarioRed } from "./redes"

describe("usuarioRed", () => {
  it("acepta link completo, sin protocolo, con @ o suelto", () => {
    expect(usuarioRed("instagram", "https://www.instagram.com/veterinariavipvet/")).toBe("veterinariavipvet")
    expect(usuarioRed("instagram", " https://www.instagram.com/veterinariavipvet/?hl=es ")).toBe("veterinariavipvet")
    expect(usuarioRed("instagram", "instagram.com/veterinariavipvet")).toBe("veterinariavipvet")
    expect(usuarioRed("instagram", "@veterinariavipvet")).toBe("veterinariavipvet")
    expect(usuarioRed("instagram", "vet.vip_2")).toBe("vet.vip_2")
    expect(usuarioRed("facebook", "https://m.facebook.com/VipVet")).toBe("VipVet")
  })

  it("rechaza vacío, texto con espacios y links de otra red", () => {
    expect(usuarioRed("instagram", "")).toBeNull()
    expect(usuarioRed("instagram", undefined)).toBeNull()
    expect(usuarioRed("instagram", "vip vet")).toBeNull()
    expect(usuarioRed("instagram", "https://www.facebook.com/vipvet")).toBeNull()
  })
})

describe("urlRed / redesConLink", () => {
  it("arma el link canónico", () => {
    expect(urlRed("instagram", "@veterinariavipvet")).toBe("https://www.instagram.com/veterinariavipvet/")
  })

  it("devuelve solo las cargadas y válidas", () => {
    expect(redesConLink({ instagram: "@vipvet", facebook: "" })).toEqual([
      { red: "instagram", usuario: "vipvet", url: "https://www.instagram.com/vipvet/" },
    ])
    expect(redesConLink(undefined)).toEqual([])
  })
})
