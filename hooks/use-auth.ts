"use client"

import { useState, useEffect } from "react"
import { onAuthStateChanged, type User } from "@/lib/supabase/auth"

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Supabase devuelve el unsubscribe directamente (no recibe `auth` como Firebase).
    const unsubscribe = onAuthStateChanged((usuario) => {
      setUser(usuario)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { user, loading }
}
