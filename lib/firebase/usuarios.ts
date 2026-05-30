import { db } from "./config"
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from "firebase/firestore"
import { invitacionesCol, invitacionId } from "./collections"
import type { Usuario, Invitacion } from "./types"

// ============ USUARIOS ============
export async function getUsuarios(): Promise<Usuario[]> {
  const ref = collection(db, "usuarios")
  const snapshot = await getDocs(ref)
  return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }) as Usuario)
}

// ============ INVITACIONES ============
export async function createInvitacion(
  tenantId: string,
  email: string,
  role: "veterinario" | "empleado",
  invitedBy?: string,
): Promise<Invitacion> {
  const id = invitacionId(tenantId, email)
  const invitacion: Invitacion = {
    email: email.trim().toLowerCase(),
    tenantId,
    role,
    estado: "pendiente",
    invitedBy: invitedBy ?? "",
    createdAt: new Date().toISOString(),
  }
  await setDoc(doc(invitacionesCol(), id), invitacion)
  return { id, ...invitacion }
}

export async function getInvitacionesByTenant(tenantId: string): Promise<Invitacion[]> {
  const q = query(invitacionesCol(), where("tenantId", "==", tenantId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitacion)
}

export async function deleteInvitacion(id: string): Promise<void> {
  await deleteDoc(doc(invitacionesCol(), id))
}
