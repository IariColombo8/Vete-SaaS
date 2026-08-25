"use client"

import { createContext, useContext } from "react"

/** true cuando el trial del tenant venció: el panel queda en solo lectura. */
const ReadOnlyContext = createContext(false)

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean
  children: React.ReactNode
}) {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      {children}
    </ReadOnlyContext.Provider>
  )
}

/** Fuera de `ReadOnlyProvider` devuelve `false` (nunca bloquea por defecto). */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}
