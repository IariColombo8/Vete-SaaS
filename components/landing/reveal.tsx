"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Reveal: fade + slide-up al entrar en viewport, con CSS e IntersectionObserver.
 *
 * Reemplaza a la versión con Motion para las secciones que entran en el JS
 * inicial de la landing (problema/solución, features, testimonios): Motion
 * pesaba ~35 KB comprimidos y hidrataba antes del primer pintado, y
 * Lighthouse cuenta todo eso en el LCP. Las secciones que sí necesitan
 * Motion (scrolly, FAQ, CTA final, stats) se cargan en diferido.
 */
interface RevealProps {
  children: ReactNode
  className?: string
  /** Demora en segundos, como en Motion. */
  delay?: number
  /** Desplazamiento inicial en px. */
  y?: number
}

export function Reveal({ children, className, delay = 0, y = 28 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : `translateY(${y}px)`,
        transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}
