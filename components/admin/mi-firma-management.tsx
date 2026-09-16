"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { getUsuarioById, actualizarFirmaVeterinario } from "@/lib/supabase/usuarios"
import { uploadFotoTenant, deleteFotoTenant } from "@/lib/supabase/storage"
import { Loader2, Save, Upload, Trash2, PenTool, Stamp } from "lucide-react"

/**
 * Firma digital del profesional: es del usuario, no del tenant. Cada
 * veterinario carga la suya acá y solo puede editar su propia fila (RLS
 * `usuarios_self_update`). Se usa en el comprobante/orden veterinaria que se
 * genera al cargar una vacuna, medicamento o desparasitación.
 */
export function MiFirmaManagement({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  const [nombreProfesional, setNombreProfesional] = useState("")
  const [especialidad, setEspecialidad] = useState("Médico Veterinario")
  const [matricula, setMatricula] = useState("")
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null)
  const [selloUrl, setSelloUrl] = useState<string | null>(null)
  const [uploadingFirma, setUploadingFirma] = useState(false)
  const [uploadingSello, setUploadingSello] = useState(false)
  const firmaInputRef = useRef<HTMLInputElement>(null)
  const selloInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    getUsuarioById(user.id).then((u) => {
      if (u) {
        setNombreProfesional(u.nombreProfesional || u.displayName || "")
        setEspecialidad(u.especialidad || "Médico Veterinario")
        setMatricula(u.matricula || "")
        setFirmaUrl(u.firmaUrl || null)
        setSelloUrl(u.selloUrl || null)
      }
      setLoadingData(false)
    })
  }, [user])

  const guardarDatos = async () => {
    if (!user) return
    setSaving(true)
    try {
      await actualizarFirmaVeterinario(user.id, {
        nombreProfesional: nombreProfesional.trim(),
        especialidad: especialidad.trim() || "Médico Veterinario",
        matricula: matricula.trim(),
        firmaUrl,
        selloUrl,
      })
      toast({ title: "Firma actualizada" })
    } catch (e) {
      console.error("Error guardando la firma:", e)
      toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const subirImagen = async (
    file: File,
    tipo: "firma" | "sello",
    urlAnterior: string | null,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
  ) => {
    if (!user) return
    setUploading(true)
    try {
      const url = await uploadFotoTenant(tenantId, `firmas/${user.id}`, file)
      setUrl(url)
      await actualizarFirmaVeterinario(user.id, {
        nombreProfesional: nombreProfesional.trim(),
        especialidad: especialidad.trim() || "Médico Veterinario",
        matricula: matricula.trim(),
        firmaUrl: tipo === "firma" ? url : firmaUrl,
        selloUrl: tipo === "sello" ? url : selloUrl,
      })
      if (urlAnterior) await deleteFotoTenant(urlAnterior)
      toast({ title: tipo === "firma" ? "Firma subida" : "Sello subido" })
    } catch (e) {
      console.error(`Error subiendo el ${tipo}:`, e)
      toast({ title: "Error", description: `No se pudo subir el ${tipo}`, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos profesionales</CardTitle>
          <CardDescription>
            Salen impresos en el comprobante/orden veterinaria junto a tu firma cada vez que cargás una vacuna, medicamento o desparasitación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); guardarDatos() }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre y apellido</Label>
              <Input value={nombreProfesional} onChange={(e) => setNombreProfesional(e.target.value)} placeholder="Dra. Priscila Gómez" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Especialidad</Label>
                <Input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} placeholder="Médico Veterinario" />
              </div>
              <div className="space-y-1.5">
                <Label>Matrícula (M.P.)</Label>
                <Input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="12345" />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : <><Save className="mr-2 h-4 w-4" />Guardar</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PenTool className="h-4 w-4" /> Firma
          </CardTitle>
          <CardDescription>Imagen de tu firma manuscrita (foto o escaneo con fondo blanco/transparente).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-muted/30 shrink-0">
              {firmaUrl
                ? <img src={firmaUrl} alt="Firma" className="h-full w-full object-contain" />
                : <PenTool className="h-6 w-6 text-muted-foreground/40" />}
            </div>
            <div className="space-y-2">
              <Button type="button" variant="outline" size="sm" disabled={uploadingFirma} onClick={() => firmaInputRef.current?.click()}>
                {uploadingFirma ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Subiendo...</> : <><Upload className="mr-2 h-3.5 w-3.5" />{firmaUrl ? "Cambiar firma" : "Subir firma"}</>}
              </Button>
              {firmaUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive block" onClick={async () => {
                  await deleteFotoTenant(firmaUrl)
                  setFirmaUrl(null)
                  if (user) await actualizarFirmaVeterinario(user.id, { nombreProfesional, especialidad, matricula, firmaUrl: null, selloUrl })
                  toast({ title: "Firma eliminada" })
                }}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar firma
                </Button>
              )}
            </div>
          </div>
          <input
            ref={firmaInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) subirImagen(file, "firma", firmaUrl, setFirmaUrl, setUploadingFirma)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stamp className="h-4 w-4" /> Sello
          </CardTitle>
          <CardDescription>Imagen de tu sello profesional (opcional).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-muted/30 shrink-0">
              {selloUrl
                ? <img src={selloUrl} alt="Sello" className="h-full w-full object-contain" />
                : <Stamp className="h-6 w-6 text-muted-foreground/40" />}
            </div>
            <div className="space-y-2">
              <Button type="button" variant="outline" size="sm" disabled={uploadingSello} onClick={() => selloInputRef.current?.click()}>
                {uploadingSello ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Subiendo...</> : <><Upload className="mr-2 h-3.5 w-3.5" />{selloUrl ? "Cambiar sello" : "Subir sello"}</>}
              </Button>
              {selloUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive block" onClick={async () => {
                  await deleteFotoTenant(selloUrl)
                  setSelloUrl(null)
                  if (user) await actualizarFirmaVeterinario(user.id, { nombreProfesional, especialidad, matricula, firmaUrl, selloUrl: null })
                  toast({ title: "Sello eliminado" })
                }}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar sello
                </Button>
              )}
            </div>
          </div>
          <input
            ref={selloInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) subirImagen(file, "sello", selloUrl, setSelloUrl, setUploadingSello)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
