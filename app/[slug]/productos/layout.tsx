import type { Metadata } from "next"
import { metadataDeTenant } from "../metadata-tenant"

interface Props {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return metadataDeTenant(slug, {
    titulo: (nombre) => `Productos y ofertas — ${nombre}`,
    descripcion: (nombre) =>
      `Catálogo de productos de ${nombre}: alimento, accesorios y ofertas vigentes. Consultá disponibilidad y precios.`,
    ruta: "/productos",
  })
}

export default function ProductosLayout({ children }: Props) {
  return children
}
