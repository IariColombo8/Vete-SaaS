import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest"
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore"

/**
 * Tests de Firestore Security Rules contra el emulador.
 *
 * Requisitos para correr (no se ejecuta en `npm test`):
 *  - `firebase-tools` instalado.
 *  - `npm run test:rules` → levanta el emulador y corre este archivo.
 *
 * Ver `firebase.json` (bloque `emulators`) para el puerto.
 */

let testEnv: RulesTestEnvironment

const TENANT = "clinica-test"

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "vetpanel-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  // Seed: doc de config del tenant + un usuario veterinario dueño + un empleado.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, "veterinarias", TENANT, "config", "datos"), { nombre: "Test", plan: "pro" })
    await setDoc(doc(db, "usuarios", "vet-uid"), { uid: "vet-uid", role: "veterinario", tenantId: TENANT })
    await setDoc(doc(db, "usuarios", "emp-uid"), { uid: "emp-uid", role: "empleado", tenantId: TENANT })
    await setDoc(doc(db, "usuarios", "user-uid"), { uid: "user-uid", role: "usuario" })
    await setDoc(doc(db, "veterinarias", TENANT, "turnos", "t1"), {
      cliente: { nombre: "Ana", telefono: "1", email: "ana@x.com" },
      mascota: { nombre: "Fido", tipo: "perro" },
      turno: { fecha: "2026-06-01", hora: "10:00" },
      estado: "pendiente",
    })
  })
})

describe("config", () => {
  it("lectura pública permitida", async () => {
    const anon = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(anon, "veterinarias", TENANT, "config", "datos")))
  })

  it("escritura solo del dueño veterinario", async () => {
    const emp = testEnv.authenticatedContext("emp-uid").firestore()
    await assertFails(setDoc(doc(emp, "veterinarias", TENANT, "config", "datos"), { nombre: "Hack" }))
    const vet = testEnv.authenticatedContext("vet-uid").firestore()
    await assertSucceeds(setDoc(doc(vet, "veterinarias", TENANT, "config", "datos"), { nombre: "OK" }, { merge: true }))
  })
})

describe("turnos", () => {
  it("el empleado del tenant puede leer turnos", async () => {
    const emp = testEnv.authenticatedContext("emp-uid").firestore()
    await assertSucceeds(getDoc(doc(emp, "veterinarias", TENANT, "turnos", "t1")))
  })

  it("un usuario ajeno no puede leer turnos", async () => {
    const user = testEnv.authenticatedContext("user-uid").firestore()
    await assertFails(getDoc(doc(user, "veterinarias", TENANT, "turnos", "t1")))
  })
})

describe("usuarios", () => {
  it("un usuario NO puede cambiar su propio role", async () => {
    const user = testEnv.authenticatedContext("user-uid").firestore()
    await assertFails(updateDoc(doc(user, "usuarios", "user-uid"), { role: "superadmin" }))
  })
})
