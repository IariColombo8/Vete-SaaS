import { getDocs, doc, setDoc, deleteDoc, onSnapshot, type Unsubscribe } from "firebase/firestore"
import { diasCol } from "./collections"
import type { DiaBloqueado } from "./types"

// ============ DISPONIBILIDAD ============
export async function getDiasBloqueados(tenantId: string): Promise<DiaBloqueado[]> {
  const snapshot = await getDocs(diasCol(tenantId))
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DiaBloqueado)
}

/**
 * Suscripción real-time a los días bloqueados del tenant.
 * Devuelve la función `Unsubscribe` — llamarla al desmontar para evitar fugas.
 */
export function subscribeDiasBloqueados(
  tenantId: string,
  onData: (dias: DiaBloqueado[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    diasCol(tenantId),
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DiaBloqueado)),
    (error) => onError?.(error),
  )
}

export async function bloquearDia(tenantId: string, fecha: string, motivo?: string) {
  const diaRef = doc(diasCol(tenantId), fecha)
  await setDoc(diaRef, { fecha, motivo: motivo || "Día bloqueado", fechaCreacion: new Date().toISOString() })
  return { id: fecha }
}

export async function desbloquearDia(tenantId: string, diaId: string) {
  return await deleteDoc(doc(diasCol(tenantId), diaId))
}
