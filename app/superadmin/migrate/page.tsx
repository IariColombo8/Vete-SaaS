"use client"

import { useState } from "react"
import {
  collection, getDocs, doc, getDoc, setDoc, query, orderBy
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { createTenant, clienteDocId, mascotaDocId } from "@/lib/firebase/firestore"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Loader2, AlertTriangle, ArrowRight } from "lucide-react"

// ── Helpers ────────────────────────────────────────────────────────────────
const TENANT_ID = "priscilas"

function toId(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "") || "sin-nombre"
}

type StepStatus = "idle" | "running" | "ok" | "error" | "skip"
interface Step { label: string; status: StepStatus; detail?: string }

// ── Componente ────────────────────────────────────────────────────────────
export default function MigratePage() {
  const [running, setRunning] = useState(false)
  const [done, setDone]       = useState(false)
  const [steps, setSteps]     = useState<Step[]>([])
  const [log, setLog]         = useState<string[]>([])

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  function setStep(label: string, status: StepStatus, detail?: string) {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.label === label)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { label, status, detail }; return next
      }
      return [...prev, { label, status, detail }]
    })
  }

  async function runMigration() {
    setRunning(true)
    setSteps([])
    setLog([])

    try {
      // ── 0. Verificar si ya existe ─────────────────────────────────────
      setStep("Verificar estado previo", "running")
      const vetSnap = await getDoc(doc(db, "veterinarias", TENANT_ID))
      const tenantYaExiste = vetSnap.exists()
      if (tenantYaExiste) {
        setStep("Verificar estado previo", "skip", "El tenant ya existe — se preserva su configuración actual")
      } else {
        setStep("Verificar estado previo", "ok", "Tenant nuevo")
      }

      // ── 1. Crear documento del tenant (solo si no existe) ─────────────
      // IMPORTANTE: nunca sobreescribir config existente con createTenant,
      // ya que setDoc sin merge destruiría nombre, logo, horarios, etc.
      setStep("Crear veterinaria", "running")
      if (!tenantYaExiste) {
        await createTenant(TENANT_ID, {
          nombre: "Salud Animal Domiciliaria",
          plan: "plus",
          adminIds: [],
        })
        setStep("Crear veterinaria", "ok", "Tenant creado")
      } else {
        setStep("Crear veterinaria", "skip", "Ya existe — configuración preservada")
      }

      // ── 2. Migrar clientes + mascotas + historias ─────────────────────
      setStep("Migrar clientes", "running")
      const clientesSnap = await getDocs(collection(db, "clientes"))
      addLog(`Encontrados ${clientesSnap.size} clientes en colección raíz`)

      // Mapa oldId → newId para referencias cruzadas de turnos
      const clienteIdMap: Record<string, string> = {}
      const mascotaIdMap: Record<string, Record<string, string>> = {}

      let cCount = 0
      for (const cDoc of clientesSnap.docs) {
        const cliente = cDoc.data()
        const newCId = cliente.dni?.trim() ? clienteDocId(cliente.dni.trim()) : toId(cliente.nombre)
        clienteIdMap[cDoc.id] = newCId

        await setDoc(
          doc(db, "veterinarias", TENANT_ID, "clientes", newCId),
          { ...cliente, _migratedFrom: cDoc.id }
        )

        // Mascotas
        mascotaIdMap[cDoc.id] = {}
        const mascotasSnap = await getDocs(collection(db, "clientes", cDoc.id, "mascotas"))
        for (const mDoc of mascotasSnap.docs) {
          const mascota = mDoc.data()
          const newMId = mascotaDocId(mascota.nombre ?? "sin-nombre", mascota.tipo ?? "animal")
          mascotaIdMap[cDoc.id][mDoc.id] = newMId

          await setDoc(
            doc(db, "veterinarias", TENANT_ID, "clientes", newCId, "mascotas", newMId),
            { ...mascota, _migratedFrom: mDoc.id }
          )

          // Historias
          const historiasSnap = await getDocs(
            collection(db, "clientes", cDoc.id, "mascotas", mDoc.id, "historias")
          )
          const fechasUsadas = new Set<string>()
          for (const hDoc of historiasSnap.docs) {
            const historia = hDoc.data()
            let baseId = (historia.fechaAtencion ?? "").slice(0, 10).replace(/\//g, "-") || hDoc.id
            let finalId = baseId; let attempt = 1
            while (fechasUsadas.has(finalId)) { attempt++; finalId = `${baseId}-${attempt}` }
            fechasUsadas.add(finalId)
            await setDoc(
              doc(db, "veterinarias", TENANT_ID, "clientes", newCId, "mascotas", newMId, "historias", finalId),
              { ...historia, _migratedFrom: hDoc.id }
            )
          }

          // Historia clínica (registro consolidado)
          const hcSnap = await getDoc(
            doc(db, "clientes", cDoc.id, "mascotas", mDoc.id, "historiaClinica", "registro")
          )
          if (hcSnap.exists()) {
            await setDoc(
              doc(db, "veterinarias", TENANT_ID, "clientes", newCId, "mascotas", newMId, "historiaClinica", "registro"),
              hcSnap.data()
            )
          }
        }
        cCount++
        addLog(`✓ Cliente ${cCount}/${clientesSnap.size}: ${cliente.nombre} (${newCId})`)
      }
      setStep("Migrar clientes", "ok", `${cCount} clientes migrados`)

      // ── 3. Migrar turnos ─────────────────────────────────────────────
      setStep("Migrar turnos", "running")
      const turnosSnap = await getDocs(
        query(collection(db, "turnos"), orderBy("turno.timestamp"))
      )
      addLog(`Encontrados ${turnosSnap.size} turnos`)

      let turnoNum = 1
      const turnosMes: Record<string, number> = {}

      for (const tDoc of turnosSnap.docs) {
        const turno = tDoc.data()
        const primerNombre = (turno.cliente?.nombre ?? "Cliente").split(/\s+/)[0]
        const nombreMascota = turno.mascota?.nombre ?? "Mascota"
        const turnoId = `${turnoNum}_${primerNombre}_${nombreMascota}`

        // Actualizar referencias a los nuevos IDs
        const newClienteId = turno.clienteId ? (clienteIdMap[turno.clienteId] ?? turno.clienteId) : ""
        const newMascotaId = (turno.clienteId && turno.mascotaId)
          ? (mascotaIdMap[turno.clienteId]?.[turno.mascotaId] ?? turno.mascotaId)
          : (turno.mascotaId ?? "")

        // Contar por mes
        const mes = (turno.fecha ?? "").slice(0, 7)
        if (mes) turnosMes[mes] = (turnosMes[mes] ?? 0) + 1

        await setDoc(
          doc(db, "veterinarias", TENANT_ID, "turnos", turnoId),
          { ...turno, clienteId: newClienteId, mascotaId: newMascotaId, _migratedFrom: tDoc.id }
        )
        addLog(`✓ Turno ${turnoId}`)
        turnoNum++
      }

      // Contador
      await setDoc(
        doc(db, "veterinarias", TENANT_ID, "config", "contadores"),
        { turnos: turnoNum - 1, turnosMes }
      )
      setStep("Migrar turnos", "ok", `${turnoNum - 1} turnos migrados`)

      // ── 4. Migrar días bloqueados ─────────────────────────────────────
      setStep("Migrar días bloqueados", "running")
      // Origen 1: colección diasBloqueados
      const diasSnap = await getDocs(collection(db, "diasBloqueados"))
      let diasCount = 0
      for (const dDoc of diasSnap.docs) {
        const dia = dDoc.data()
        const newId = dia.fecha ?? dDoc.id
        await setDoc(doc(db, "veterinarias", TENANT_ID, "diasBloqueados", newId), dia)
        diasCount++
      }
      // Origen 2: settings/blockedDates (formato viejo)
      const settingsSnap = await getDoc(doc(db, "settings", "blockedDates"))
      if (settingsSnap.exists()) {
        const dates: string[] = settingsSnap.data().dates ?? []
        for (const fecha of dates) {
          await setDoc(
            doc(db, "veterinarias", TENANT_ID, "diasBloqueados", fecha),
            { fecha, motivo: "Migrado desde settings", fechaCreacion: new Date().toISOString() }
          )
          diasCount++
        }
      }
      setStep("Migrar días bloqueados", "ok", `${diasCount} días migrados`)

      setDone(true)
      addLog("✅ Migración completada exitosamente")

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setStep("Error", "error", msg)
      addLog(`❌ Error: ${msg}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto px-4 py-12">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold mb-1">Migración a estructura multi-tenant</h1>
          <p className="text-muted-foreground text-sm">
            Mueve todos los datos existentes de las colecciones raíz a{" "}
            <code className="bg-muted px-1 rounded">veterinarias/priscilas/...</code>{" "}
            con los nuevos IDs legibles.
          </p>
        </div>

        {/* Aviso orden de ejecución */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 mb-6 text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
            ⚠ Correr ANTES de deployar las Firestore Security Rules
          </p>
          <p className="text-amber-700 dark:text-amber-400 text-xs">
            Una vez que las Rules estén activas, las colecciones raíz{" "}
            <code className="bg-amber-200/50 dark:bg-amber-900/40 px-1 rounded">/clientes</code>,{" "}
            <code className="bg-amber-200/50 dark:bg-amber-900/40 px-1 rounded">/turnos</code> y{" "}
            <code className="bg-amber-200/50 dark:bg-amber-900/40 px-1 rounded">/diasBloqueados</code>{" "}
            quedan bloqueadas y esta migración fallará.
          </p>
        </div>

        {/* Resumen de cambios */}
        <div className="rounded-xl border bg-muted/30 p-5 mb-6 space-y-2 text-sm">
          <p className="font-semibold mb-3">Qué hará esta migración:</p>
          {[
            ["/clientes/{autoId}", "veterinarias/priscilas/clientes/{DNI}"],
            ["/clientes/.../mascotas/{autoId}", "…/mascotas/{nombre-tipo}"],
            ["/clientes/.../historias/{autoId}", "…/historias/{YYYY-MM-DD}"],
            ["/turnos/{autoId}", "veterinarias/priscilas/turnos/{n_Cliente_Mascota}"],
            ["/diasBloqueados + settings/blockedDates", "veterinarias/priscilas/diasBloqueados/{fecha}"],
          ].map(([from, to]) => (
            <div key={from} className="flex items-start gap-2 font-mono text-xs">
              <span className="text-muted-foreground shrink-0">{from}</span>
              <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">{to}</span>
            </div>
          ))}
          <div className="border-t pt-3 mt-3 space-y-1 text-xs text-muted-foreground">
            <p>✅ <strong>Idempotente</strong>: se puede correr más de una vez sin duplicar datos.</p>
            <p>✅ <strong>No destructiva</strong>: los documentos originales no se eliminan.</p>
            <p>✅ <strong>Preserva config</strong>: si el tenant ya existe, su configuración no se toca.</p>
          </div>
        </div>

        {/* Botón */}
        {!done && (
          <Button onClick={runMigration} disabled={running} size="lg" className="mb-8 bg-emerald-600 hover:bg-emerald-700">
            {running ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Migrando…</>
            ) : (
              "Ejecutar migración"
            )}
          </Button>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div className="space-y-2 mb-6">
            {steps.map((s) => (
              <div key={s.label} className="flex items-center gap-3 text-sm">
                {s.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                {s.status === "ok"      && <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                {s.status === "error"   && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                {s.status === "skip"    && <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />}
                {s.status === "idle"    && <div className="h-4 w-4 rounded-full border shrink-0" />}
                <span className="font-medium">{s.label}</span>
                {s.detail && <span className="text-muted-foreground">— {s.detail}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div className="rounded-xl border bg-slate-950 p-4 font-mono text-xs text-slate-300 max-h-72 overflow-y-auto space-y-0.5">
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}

        {done && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
            <p className="font-bold mb-1">✅ Migración completada</p>
            <p>Los datos están en <code className="bg-emerald-500/20 px-1 rounded">veterinarias/priscilas/</code>.</p>
            <p className="mt-1 text-xs opacity-70">
              Podés verificar en Firestore Console. Los documentos originales siguen intactos hasta que los elimines manualmente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
