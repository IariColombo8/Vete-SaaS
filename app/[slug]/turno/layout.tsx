import type { Metadata } from "next"
import { metadataDeTenant } from "../metadata-tenant"

interface Props {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return metadataDeTenant(slug, {
    titulo: (nombre) => `Reservar turno online — ${nombre}`,
    descripcion: (nombre) =>
      `Sacá turno en ${nombre} desde el celular: elegís mascota, servicio y horario disponible y recibís la confirmación.`,
    ruta: "/turno",
  })
}

export default function TurnoLayout({ children }: Props) {
  return children
}
