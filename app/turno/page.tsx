import { redirect } from "next/navigation"

// Legacy: la URL /turno ya no tiene sentido sin slug
export default function TurnoLegacyRedirect() {
  redirect("/")
}
