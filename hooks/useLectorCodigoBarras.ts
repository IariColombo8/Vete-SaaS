"use client"

import { useEffect, useRef } from "react"

/** Un lector "tipea" cada carácter a pocos ms del anterior; una persona no. */
const MAX_MS_ENTRE_TECLAS = 60
/** Menos que esto no es un código de barras (EAN-8 es el más corto común). */
const LARGO_MINIMO = 4

/**
 * ¿El texto parece un código y no una búsqueda por nombre? Sin espacios, con
 * al menos un dígito y largo razonable. Sirve para decidir qué hacer con un
 * Enter en un buscador donde se puede tanto escanear como escribir.
 */
export function pareceCodigoDeBarras(texto: string): boolean {
  const t = texto.trim()
  return t.length >= LARGO_MINIMO && !/\s/.test(t) && /\d/.test(t)
}

function esEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

/**
 * Escucha el lector de código de barras (los USB/Bluetooth se comportan como
 * un teclado: escriben el código y mandan Enter) en toda la página, sin que
 * haga falta tener el foco en el buscador.
 *
 * Solo toma las teclas que no van a un campo de texto: si el foco está en un
 * input, el código lo recibe ese input (y su propio Enter decide). Tampoco
 * escucha con un diálogo abierto, para no disparar nada por debajo de él.
 */
export function useLectorCodigoBarras(onCodigo: (codigo: string) => void, activo = true) {
  const onCodigoRef = useRef(onCodigo)
  useEffect(() => { onCodigoRef.current = onCodigo }, [onCodigo])

  useEffect(() => {
    if (!activo) return

    let buffer = ""
    let ultimaTecla = 0

    const manejar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (esEditable(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return

      const ahora = performance.now()
      if (ahora - ultimaTecla > MAX_MS_ENTRE_TECLAS) buffer = ""
      ultimaTecla = ahora

      if (e.key === "Enter") {
        const codigo = buffer.trim()
        buffer = ""
        if (codigo.length >= LARGO_MINIMO) {
          // Sin esto, el Enter "clickea" el botón que haya quedado con foco.
          e.preventDefault()
          e.stopPropagation()
          onCodigoRef.current(codigo)
        }
        return
      }

      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener("keydown", manejar, true)
    return () => window.removeEventListener("keydown", manejar, true)
  }, [activo])
}
