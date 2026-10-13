import { describe, expect, it } from "vitest"
import { esImagenSupabase, imagenSupabase, srcSetSupabase } from "./imagenes"

const LOGO = "https://abc.supabase.co/storage/v1/object/public/veterinarias/vipvet/logo/1-logo.png"

describe("imagenSupabase", () => {
  it("pasa al endpoint de transformación con ancho y calidad", () => {
    expect(imagenSupabase(LOGO, 200)).toBe(
      "https://abc.supabase.co/storage/v1/render/image/public/veterinarias/vipvet/logo/1-logo.png?width=200&quality=75&resize=contain",
    )
  })

  it("respeta una query existente y la calidad pedida", () => {
    expect(imagenSupabase(`${LOGO}?v=2`, 100, 60)).toMatch(/\?v=2&width=100&quality=60&resize=contain$/)
  })

  it("deja intactas las URLs que no son del bucket", () => {
    const externa = "https://images.unsplash.com/photo-1?w=1400"
    expect(esImagenSupabase(externa)).toBe(false)
    expect(imagenSupabase(externa, 200)).toBe(externa)
    expect(srcSetSupabase(externa, [100, 200])).toBeUndefined()
  })

  it("arma el srcset con descriptores de ancho", () => {
    expect(srcSetSupabase(LOGO, [128, 256])).toBe(
      `${imagenSupabase(LOGO, 128)} 128w, ${imagenSupabase(LOGO, 256)} 256w`,
    )
  })
})
