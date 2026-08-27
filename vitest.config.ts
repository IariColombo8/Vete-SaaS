import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Valores dummy: alcanza para que `lib/supabase/config.ts` no tire al
    // importarse en tests que solo ejercitan funciones puras del módulo.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key",
    },
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
