import { defineConfig, devices } from "@playwright/test"

/**
 * Configuración de E2E con Playwright.
 *
 * Requisitos para correr:
 *  1. Instalar navegadores una vez: `npx playwright install`
 *  2. Tener `.env.local` con la config de Firebase (o usar el emulador).
 *  3. `npm run test:e2e` — levanta `npm run dev` automáticamente.
 *
 * Los tests viven en `e2e/`. Por defecto solo cubren smoke tests públicos
 * (landing, pricing, booking) que no requieren autenticación.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Levanta el dev server salvo que se apunte a una URL externa.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
