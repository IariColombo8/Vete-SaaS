import { NextResponse } from "next/server"
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin"

/**
 * Acepta automáticamente una invitación pendiente para el usuario autenticado.
 *
 * Se llama tras el login. Verifica el ID token de Firebase, busca una
 * invitación pendiente para el email del usuario y, si existe, asigna
 * `role` + `tenantId` en su documento `usuarios/{uid}` usando el Admin SDK
 * (las Firestore Rules impiden que el propio usuario se asigne rol).
 *
 * Auth: header `Authorization: Bearer <Firebase ID token>`.
 */
export async function POST(request: Request) {
  const adminDb = getAdminDb()
  const adminAuth = getAdminAuth()
  if (!adminDb || !adminAuth) {
    return NextResponse.json(
      { ok: false, error: "Firebase Admin no configurado en el servidor" },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) {
    return NextResponse.json({ ok: false, error: "Falta el token" }, { status: 401 })
  }

  let uid: string
  let email: string | undefined
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    uid = decoded.uid
    email = decoded.email?.toLowerCase()
  } catch {
    return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 })
  }

  if (!email) {
    return NextResponse.json({ ok: true, applied: false, reason: "sin_email" })
  }

  try {
    const snap = await adminDb
      .collection("invitaciones")
      .where("email", "==", email)
      .where("estado", "==", "pendiente")
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ ok: true, applied: false })
    }

    const invDoc = snap.docs[0]
    const inv = invDoc.data() as { tenantId: string; role: "veterinario" | "empleado" }

    await adminDb.collection("usuarios").doc(uid).set(
      { role: inv.role, tenantId: inv.tenantId },
      { merge: true },
    )
    await invDoc.ref.update({ estado: "aceptada", aceptadaAt: new Date().toISOString() })

    return NextResponse.json({ ok: true, applied: true, role: inv.role, tenantId: inv.tenantId })
  } catch (error) {
    console.error("[invitaciones/aceptar] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
