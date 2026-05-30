import { defineConfig } from "vitest/config"
import path from "node:path"

/**
 * Config dedicada para los tests de Firestore Rules (requieren el emulador).
 * Se corre vía `npm run test:rules` (firebase emulators:exec).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["firestore.rules.test.ts"],
    // Sin timeout corto: el arranque del emulador + setup puede demorar.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
