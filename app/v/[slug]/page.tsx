import { redirect } from "next/navigation"

interface Props { params: Promise<{ slug: string }> }

export default async function VetLegacyRedirect({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}`)
}
