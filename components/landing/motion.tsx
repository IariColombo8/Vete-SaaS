"use client"

import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react"

/**
 * Micro-animaciones de la landing sin librería. Antes usaban Motion, que
 * pesaba ~40 KB comprimidos en el JS inicial de la landing y, al hidratar
 * antes del primer pintado, Lighthouse lo sumaba entero al LCP en móvil.
 * El Reveal al entrar en viewport vive en `reveal.tsx`.
 */

function prefiereMenosMovimiento() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// ─── Magnetic: el elemento "persigue" sutilmente al cursor ───────────────────
export function Magnetic({
  children,
  className,
  strength = 0.35,
}: {
  children: ReactNode
  className?: string
  strength?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  function onMove(e: ReactMouseEvent) {
    const el = ref.current
    if (!el || prefiereMenosMovimiento()) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - (r.left + r.width / 2)) * strength
    const y = (e.clientY - (r.top + r.height / 2)) * strength
    el.style.transform = `translate(${x}px, ${y}px)`
  }
  function reset() {
    if (ref.current) ref.current.style.transform = "translate(0px, 0px)"
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={`inline-block transition-transform duration-300 ease-out ${className ?? ""}`}
    >
      {children}
    </div>
  )
}

// ─── CountUp: número que sube al verse ───────────────────────────────────────
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.6,
  className,
}: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // En el HTML del servidor va el valor final: si el JS tarda, el número ya se lee.
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const el = ref.current
    if (!el || prefiereMenosMovimiento()) return

    let frame = 0
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        obs.disconnect()
        const inicio = performance.now()
        const ms = duration * 1000
        const paso = (ahora: number) => {
          const t = Math.min((ahora - inicio) / ms, 1)
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplay(value * eased)
          if (t < 1) frame = requestAnimationFrame(paso)
        }
        setDisplay(0)
        frame = requestAnimationFrame(paso)
      },
      { rootMargin: "0px 0px -12% 0px" },
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value, duration])

  const text = display.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span ref={ref} className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  )
}
