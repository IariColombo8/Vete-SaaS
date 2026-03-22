import { SlugProvider } from "@/context/slug-context"
import type React from "react"

interface Props {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

export default async function SlugLayout({ params, children }: Props) {
  const { slug } = await params
  return <SlugProvider slug={slug}>{children}</SlugProvider>
}
