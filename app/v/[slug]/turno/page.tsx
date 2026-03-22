import { redirect } from "next/navigation"

interface Props { params: Promise<{ slug: string }> }

export default async function VetTurnoLegacyRedirect({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}/turno`)
}
