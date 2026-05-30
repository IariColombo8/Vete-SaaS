import { doc, setDoc, getDocs, query, where, deleteDoc, updateDoc } from "firebase/firestore"
import { recordatoriosVacunaCol } from "./collections"
import type { RecordatorioVacuna } from "./types"

// ============ RECORDATORIOS DE VACUNAS ============
export async function createRecordatorioVacuna(
  tenantId: string,
  data: Omit<RecordatorioVacuna, "id" | "enviado" | "createdAt">,
): Promise<RecordatorioVacuna> {
  const ref = doc(recordatoriosVacunaCol(tenantId))
  const recordatorio: RecordatorioVacuna = { ...data, enviado: false, createdAt: new Date().toISOString() }
  await setDoc(ref, recordatorio)
  return { id: ref.id, ...recordatorio }
}

export async function getRecordatoriosVacunaByMascota(
  tenantId: string,
  mascotaId: string,
): Promise<RecordatorioVacuna[]> {
  const q = query(recordatoriosVacunaCol(tenantId), where("mascotaId", "==", mascotaId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as RecordatorioVacuna)
}

export async function deleteRecordatorioVacuna(tenantId: string, id: string): Promise<void> {
  await deleteDoc(doc(recordatoriosVacunaCol(tenantId), id))
}

/** Recordatorios de vacuna pendientes para una fecha (usado por el cron). */
export async function getRecordatoriosVacunaPendientes(
  tenantId: string,
  fecha: string,
): Promise<RecordatorioVacuna[]> {
  const q = query(
    recordatoriosVacunaCol(tenantId),
    where("fecha", "==", fecha),
    where("enviado", "==", false),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as RecordatorioVacuna)
}

export async function marcarRecordatorioVacunaEnviado(tenantId: string, id: string): Promise<void> {
  await updateDoc(doc(recordatoriosVacunaCol(tenantId), id), { enviado: true, enviadoAt: new Date().toISOString() })
}
