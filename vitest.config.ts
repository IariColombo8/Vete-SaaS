import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // Los tests de rules requieren el emulador (correr con `npm run test:rules`).
    // "parte de kiosko" es el proyecto de referencia que se está portando:
    // sus tests usan `node:test`, no vitest.
    exclude: ["node_modules", ".next", ".claude", "e2e", "parte de kiosko/**", "**/*.rules.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "hooks/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
