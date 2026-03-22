import { redirect } from "next/navigation"

// Legacy: redirige a la veterinaria por defecto
export default function TurnoLegacyRedirect() {
  redirect("/priscilas/turno")
}
