/**
 * Seed de una veterinaria de demostración (slug "demo") para mostrar en el landing.
 *
 * Requiere credenciales de Firebase Admin en el entorno:
 *   FIREBASE_SERVICE_ACCOUNT_KEY (JSON)  ó  FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY
 *
 * Uso (Node 20+, carga .env.local):
 *   node --env-file=.env.local scripts/seed-demo.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

function buildCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (raw) {
    const p = JSON.parse(raw)
    return cert({ projectId: p.project_id, clientEmail: p.client_email, privateKey: p.private_key?.replace(/\\n/g, "\n") })
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey })
  throw new Error("Faltan credenciales de Firebase Admin (FIREBASE_SERVICE_ACCOUNT_KEY o el trío PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY).")
}

const SLUG = "demo"

async function main() {
  if (getApps().length === 0) initializeApp({ credential: buildCredential() })
  const db = getFirestore()

  await db.doc(`veterinarias/${SLUG}`).set({}, { merge: true })

  await db.doc(`veterinarias/${SLUG}/config/datos`).set({
    nombre: "Veterinaria Demo",
    plan: "pro",
    status: "activo",
    modalidad: "ambos",
    slogan: "Cuidamos a tu mascota como si fuera nuestra",
    descripcion: "Esta es una veterinaria de ejemplo para que veas cómo se ve tu página con VetPanel.",
    telefono: "+54 11 5555-5555",
    email: "demo@vetpanel.app",
    ciudad: "Buenos Aires",
    direccion: "Av. Siempreviva 742",
    onboardingCompletado: true,
    servicios: [
      { emoji: "🩺", nombre: "Consulta general", descripcion: "Revisión completa de tu mascota" },
      { emoji: "💉", nombre: "Vacunación", descripcion: "Plan de vacunas al día" },
      { emoji: "🛁", nombre: "Peluquería", descripcion: "Baño y corte profesional" },
      { emoji: "🚨", nombre: "Urgencias", descripcion: "Atención de emergencias" },
    ],
    horarios: [
      { dia: "Lunes a Viernes", apertura: "09:00", cierre: "18:00", cerrado: false },
      { dia: "Sabado", apertura: "09:00", cierre: "13:00", cerrado: false },
      { dia: "Domingo", apertura: "", cierre: "", cerrado: true },
    ],
  }, { merge: true })

  await db.doc(`veterinarias/${SLUG}/config/turno`).set({
    mascotas: [
      { id: "perro", emoji: "🐕", nombre: "Perro" },
      { id: "gato", emoji: "🐈", nombre: "Gato" },
    ],
    servicios: [
      { id: "consulta-general", emoji: "🩺", nombre: "Consulta general", descripcion: "Examen clínico", duracionMin: 30 },
      { id: "vacunacion", emoji: "💉", nombre: "Vacunación", descripcion: "Aplicación de vacunas", duracionMin: 30 },
      { id: "peluqueria", emoji: "🛁", nombre: "Peluquería", descripcion: "Baño y corte", duracionMin: 60 },
    ],
  }, { merge: true })

  console.log(`✓ Veterinaria demo creada en /veterinarias/${SLUG}. Visitá /${SLUG}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
