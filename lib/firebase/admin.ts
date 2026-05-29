import "server-only"
import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getAuth, type Auth } from "firebase-admin/auth"

/**
 * Firebase Admin SDK (server-only).
 *
 * Se usa para operaciones privilegiadas que las Firestore Rules bloquean al
 * cliente: aceptar invitaciones (asignar role/tenantId) y actualizar el plan
 * desde webhooks de pago.
 *
 * Credenciales vía env (una de las dos formas):
 *  - FIREBASE_SERVICE_ACCOUNT_KEY : JSON completo del service account (string).
 *  - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 *
 * Si no hay credenciales, `getAdminDb()` devuelve null (las rutas que lo usan
 * responden 503 con un mensaje claro).
 */

let cachedApp: App | null = null

function buildCredentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: (parsed.private_key as string)?.replace(/\\n/g, "\n"),
      })
    } catch (error) {
      console.error("[admin] FIREBASE_SERVICE_ACCOUNT_KEY inválido:", error)
      return null
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey })
  }

  return null
}

function getAdminApp(): App | null {
  if (cachedApp) return cachedApp
  if (getApps().length > 0) {
    cachedApp = getApps()[0]
    return cachedApp
  }
  const credential = buildCredentials()
  if (!credential) {
    console.warn("[admin] Credenciales de Firebase Admin no configuradas")
    return null
  }
  cachedApp = initializeApp({ credential })
  return cachedApp
}

/** Devuelve el Firestore admin o null si no hay credenciales. */
export function getAdminDb(): Firestore | null {
  const app = getAdminApp()
  return app ? getFirestore(app) : null
}

/** Devuelve el Auth admin o null si no hay credenciales. */
export function getAdminAuth(): Auth | null {
  const app = getAdminApp()
  return app ? getAuth(app) : null
}
