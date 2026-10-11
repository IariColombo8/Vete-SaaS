import { describe, it, expect } from "vitest"
import type { TenantFull, Usuario } from "@/lib/supabase/types"
import {
  estadoTrial, filtrarTenants, filtrarUsuarios, resumenPlataforma, rolDeUsuario,
} from "./resumen"

const AHORA = new Date("2026-10-04T12:00:00Z")
const DIA = 24 * 60 * 60 * 1000

function tenant(over: Partial<TenantFull> = {}): TenantFull {
  return { slug: "vet", nombre: "Vet", plan: "basico", status: "activo", ...over } as TenantFull
}

function usuario(over: Partial<Usuario> = {}): Usuario {
  return { uid: "u", email: "a@b.com", role: "usuario", ...over }
}

describe("estadoTrial", () => {
  it("sin fecha de vencimiento no está en trial", () => {
    expect(estadoTrial(null, AHORA)).toEqual({ tipo: "sin-trial", diasRestantes: null })
    expect(estadoTrial(undefined, AHORA).tipo).toBe("sin-trial")
  })

  it("cuenta los días que faltan redondeando para arriba", () => {
    const vence = new Date(AHORA.getTime() + 2.5 * DIA).toISOString()
    expect(estadoTrial(vence, AHORA)).toEqual({ tipo: "activo", diasRestantes: 3 })
  })

  it("una fecha pasada es un trial vencido", () => {
    const vence = new Date(AHORA.getTime() - DIA).toISOString()
    expect(estadoTrial(vence, AHORA)).toEqual({ tipo: "vencido", diasRestantes: 0 })
  })
})

describe("resumenPlataforma", () => {
  it("separa activas de pausadas: antes se contaban todas como activas", () => {
    const r = resumenPlataforma(
      [tenant({ slug: "a" }), tenant({ slug: "b", status: "pausado" }), tenant({ slug: "c" })],
      [],
      AHORA,
    )
    expect(r.veterinarias).toBe(3)
    expect(r.activas).toBe(2)
    expect(r.pausadas).toBe(1)
  })

  it("cuenta trials vigentes y vencidos por separado", () => {
    const r = resumenPlataforma(
      [
        tenant({ slug: "a", trialExpiresAt: new Date(AHORA.getTime() + DIA).toISOString() }),
        tenant({ slug: "b", trialExpiresAt: new Date(AHORA.getTime() - DIA).toISOString() }),
        tenant({ slug: "c", trialExpiresAt: null }),
      ],
      [],
      AHORA,
    )
    expect(r.enTrial).toBe(1)
    expect(r.trialVencido).toBe(1)
  })

  it("cuenta staff (veterinario + empleado) y superadmins", () => {
    const r = resumenPlataforma(
      [],
      [
        usuario({ uid: "1", role: "veterinario" }),
        usuario({ uid: "2", role: "empleado" }),
        usuario({ uid: "3", role: "superadmin" }),
        usuario({ uid: "4", role: "usuario" }),
      ],
      AHORA,
    )
    expect(r.usuarios).toBe(4)
    expect(r.staff).toBe(2)
    expect(r.superadmins).toBe(1)
  })
})

describe("rolDeUsuario", () => {
  it("respeta el rol empleado (antes se mostraba como Usuario)", () => {
    expect(rolDeUsuario(usuario({ role: "empleado" }))).toBe("empleado")
  })

  it("cae en el flag viejo isAdmin si no hay rol", () => {
    expect(rolDeUsuario(usuario({ role: undefined as unknown as Usuario["role"], isAdmin: true }))).toBe("veterinario")
  })
})

describe("filtrarTenants", () => {
  const lista = [
    tenant({ slug: "zeta", nombre: "Zeta Vet", plan: "pro" }),
    tenant({ slug: "alfa", nombre: "Alfa Vet", status: "pausado" }),
    tenant({ slug: "beta", nombre: "Beta Vet", plan: "basico" }),
  ]

  it("pone las activas primero y ordena alfabéticamente", () => {
    const r = filtrarTenants(lista, { busqueda: "", estado: "todas", plan: "todos" })
    expect(r.map((t) => t.slug)).toEqual(["beta", "zeta", "alfa"])
  })

  it("filtra por estado, plan y texto (nombre o slug)", () => {
    expect(filtrarTenants(lista, { busqueda: "", estado: "pausadas", plan: "todos" }).map((t) => t.slug)).toEqual(["alfa"])
    expect(filtrarTenants(lista, { busqueda: "", estado: "todas", plan: "pro" }).map((t) => t.slug)).toEqual(["zeta"])
    expect(filtrarTenants(lista, { busqueda: "BET", estado: "todas", plan: "todos" }).map((t) => t.slug)).toEqual(["beta"])
  })

  it("un tenant sin plan cuenta como básico", () => {
    const r = filtrarTenants([tenant({ slug: "x", plan: undefined })], { busqueda: "", estado: "todas", plan: "basico" })
    expect(r).toHaveLength(1)
  })
})

describe("filtrarUsuarios", () => {
  const lista = [
    usuario({ uid: "1", displayName: "Ana Pérez", email: "ana@x.com", role: "veterinario" }),
    usuario({ uid: "2", displayName: "Bruno", email: "bruno@x.com", role: "usuario" }),
  ]

  it("busca por nombre o email, sin distinguir mayúsculas", () => {
    expect(filtrarUsuarios(lista, "PÉREZ", "todos").map((u) => u.uid)).toEqual(["1"])
    expect(filtrarUsuarios(lista, "bruno@", "todos").map((u) => u.uid)).toEqual(["2"])
  })

  it("filtra por rol", () => {
    expect(filtrarUsuarios(lista, "", "veterinario").map((u) => u.uid)).toEqual(["1"])
  })
})
