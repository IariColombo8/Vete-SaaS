"use client"
import { createContext, useContext } from "react"
import type React from "react"

const SlugContext = createContext<string>("")
export const useSlug = () => useContext(SlugContext)
export function SlugProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <SlugContext.Provider value={slug}>{children}</SlugContext.Provider>
}
