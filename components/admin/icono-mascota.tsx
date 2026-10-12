import { Bird, Cat, Dog, PawPrint } from "lucide-react"

/**
 * Ícono según el tipo de mascota. Es un componente (y no una función que
 * devuelve `Dog`/`Cat`) para no crear componentes durante el render: eso hace
 * que React desmonte y vuelva a montar el ícono en cada render.
 */
export function IconoMascota({ tipo, className }: { tipo?: string; className?: string }) {
  const t = tipo?.toLowerCase() ?? ""
  if (t.includes("perro") || t.includes("dog")) return <Dog className={className} />
  if (t.includes("gato") || t.includes("cat")) return <Cat className={className} />
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return <Bird className={className} />
  return <PawPrint className={className} />
}
