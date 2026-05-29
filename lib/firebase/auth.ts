import { auth, db } from "./config"
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth"
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore"
import type { UserRole } from "./firestore"

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Busca el documento del usuario en la colección "usuarios" por su uid (campo). */
async function findUserDoc(uid: string) {
  // Primero intenta el formato legacy: doc con ID = uid
  const legacyRef = doc(db, "usuarios", uid)
  const legacySnap = await getDoc(legacyRef)
  if (legacySnap.exists()) return { ref: legacyRef, data: legacySnap.data() }

  // Formato nuevo: doc con ID legible, campo uid = uid
  const q = query(collection(db, "usuarios"), where("uid", "==", uid), limit(1))
  const snap = await getDocs(q)
  if (!snap.empty) return { ref: snap.docs[0].ref, data: snap.docs[0].data() }

  return null
}

// ── Crear / actualizar usuario ─────────────────────────────────────────────────

const createOrUpdateUser = async (user: User) => {
  try {
    const existing = await findUserDoc(user.uid)

    if (existing) {
      await updateDoc(existing.ref, { lastLogin: serverTimestamp() })

      // Migración: si el doc existente no tiene el UID como ID, crear uno nuevo con UID
      // y dejar el viejo como está (no se borra para no perder datos)
      if (existing.ref.id !== user.uid) {
        const uidRef = doc(db, "usuarios", user.uid)
        const uidSnap = await getDoc(uidRef)
        if (!uidSnap.exists()) {
          await setDoc(uidRef, {
            ...existing.data,
            uid: user.uid,
            lastLogin: serverTimestamp(),
          })
        }
      }
      return
    }

    // Nuevo usuario: doc ID = UID de Firebase Auth (requerido por Firestore Rules)
    await setDoc(doc(db, "usuarios", user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: "usuario" as UserRole,
      isAdmin: false,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error al crear/actualizar usuario:", error)
  }
}

// ── Exports públicos ──────────────────────────────────────────────────────────

/**
 * Si hay una invitación pendiente para este usuario, la acepta server-side
 * (asigna role/tenantId). Best-effort: no bloquea el login si falla.
 */
const aceptarInvitacionPendiente = async (user: User) => {
  try {
    const token = await user.getIdToken()
    await fetch("/api/invitaciones/aceptar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (error) {
    console.error("Error al aceptar invitación pendiente:", error)
  }
}

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)
  await createOrUpdateUser(result.user)
  await aceptarInvitacionPendiente(result.user)
  return result
}

export const signOut = async () => {
  return await firebaseSignOut(auth)
}

export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

/** Devuelve el rol del usuario (soporta formato legacy y nuevo). */
export const getUserRole = async (uid: string): Promise<UserRole | null> => {
  try {
    const found = await findUserDoc(uid)
    if (!found) return null
    const data = found.data
    if (data.role) return data.role as UserRole
    if (data.isAdmin === true) return "veterinario"
    return "usuario"
  } catch (error) {
    console.error("Error al obtener rol:", error)
    return null
  }
}

/** Devuelve todos los datos del documento del usuario. */
export const getUsuarioData = async (uid: string): Promise<Record<string, unknown> | null> => {
  try {
    const found = await findUserDoc(uid)
    return found ? found.data : null
  } catch (error) {
    console.error("Error al obtener datos del usuario:", error)
    return null
  }
}

/** Actualiza campos del documento del usuario (por uid). */
export const updateUsuario = async (uid: string, data: Record<string, unknown>): Promise<void> => {
  try {
    const found = await findUserDoc(uid)
    if (found) {
      await updateDoc(found.ref, data)
    }
  } catch (error) {
    console.error("Error al actualizar usuario:", error)
  }
}

/** Verifica si el usuario tiene acceso al panel admin (veterinario, empleado o superadmin). */
export const checkIfUserIsAdmin = async (uid: string): Promise<boolean> => {
  const role = await getUserRole(uid)
  return role === "veterinario" || role === "empleado" || role === "superadmin"
}

export { onAuthStateChanged }
