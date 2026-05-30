import { test, expect } from "@playwright/test"

/**
 * Smoke tests públicos (no requieren auth). Verifican que las páginas clave
 * cargan y muestran su contenido principal.
 */

test("landing carga con el hero y CTA", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  // El landing menciona la propuesta de valor
  await expect(page.locator("body")).toContainText(/Veterinaria|VetPanel/i)
})

test("página de precios muestra los 3 planes", async ({ page }) => {
  await page.goto("/pricing")
  await expect(page.getByRole("heading", { name: /transparentes/i })).toBeVisible()
  await expect(page.locator("body")).toContainText("Básico")
  await expect(page.locator("body")).toContainText("Plus")
  await expect(page.locator("body")).toContainText("Pro")
})

test("login es accesible", async ({ page }) => {
  await page.goto("/login")
  await expect(page).toHaveURL(/\/login/)
})

/**
 * Booking público de un tenant. Requiere un tenant de ejemplo en Firestore.
 * Se salta si no se define E2E_TENANT_SLUG para no fallar en entornos sin datos.
 */
const tenantSlug = process.env.E2E_TENANT_SLUG
test(tenantSlug ? "reserva de turno: el formulario carga" : "reserva de turno (skip sin E2E_TENANT_SLUG)", async ({ page }) => {
  test.skip(!tenantSlug, "Definí E2E_TENANT_SLUG para correr el flujo de reserva.")
  await page.goto(`/${tenantSlug}/turno`)
  await expect(page.locator("form")).toBeVisible()
})
