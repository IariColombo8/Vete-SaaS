"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Link2, Upload } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { actualizarImagenProducto } from "@/lib/supabase/productos"
import { uploadFotoTenant } from "@/lib/supabase/storage"
import type { Producto } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

interface Props {
  tenantId: string
  producto: Producto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onActualizado: () => void
}

type Modo = "enlace" | "archivo"

/** Atajo desde la columna de stock: pegar un link o subir una foto del dispositivo. */
export function AgregarImagenDialog({ tenantId, producto, open, onOpenChange, onActualizado }: Props) {
  const [modo, setModo] = useState<Modo>("enlace")
  const [url, setUrl] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const inputArchivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setModo("enlace")
      setUrl(producto?.imagenUrl ?? "")
      setArchivo(null)
    }
  }, [open, producto])

  const preview = archivo ? URL.createObjectURL(archivo) : url.trim() || producto?.imagenUrl

  const guardar = async () => {
    if (!producto) return
    setGuardando(true)
    try {
      const imagenUrl = modo === "archivo" && archivo
        ? await uploadFotoTenant(tenantId, "productos", archivo)
        : url.trim()

      await actualizarImagenProducto(tenantId, producto.id, imagenUrl)
      toast.success("Imagen actualizada")
      onActualizado()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la imagen")
    } finally {
      setGuardando(false)
    }
  }

  const puedeGuardar = modo === "archivo" ? archivo !== null : url.trim() !== ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar imagen</DialogTitle>
          <DialogDescription>{producto?.nombre}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b">
          <button
            type="button"
            onClick={() => setModo("enlace")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              modo === "enlace"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Link2 className="h-3.5 w-3.5" /> Enlace
          </button>
          <button
            type="button"
            onClick={() => setModo("archivo")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              modo === "archivo"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Upload className="h-3.5 w-3.5" /> Desde el dispositivo
          </button>
        </div>

        <div className="flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-md border object-cover" />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-md border bg-muted" />
          )}

          {modo === "enlace" ? (
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="flex-1"
            />
          ) : (
            <div className="flex-1">
              <input
                ref={inputArchivoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" onClick={() => inputArchivoRef.current?.click()}>
                {archivo ? archivo.name : "Elegir foto…"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !puedeGuardar} className="bg-emerald-600 hover:bg-emerald-700">
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
