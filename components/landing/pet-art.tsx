// Ilustraciones SVG inline para el landing. Usan `currentColor`,
// así que se colorean con clases de texto de Tailwind (text-coral, etc.).
// Son decorativas: `aria-hidden` por defecto.

interface IconProps {
  className?: string
}

/** Huella clásica de 4 dedos + almohadilla. Rellena con currentColor. */
export function Paw({ className }: IconProps) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden className={className}>
      <ellipse cx="26" cy="42" rx="9" ry="12" transform="rotate(-20 26 42)" />
      <ellipse cx="42" cy="30" rx="9.5" ry="13" />
      <ellipse cx="58" cy="30" rx="9.5" ry="13" />
      <ellipse cx="74" cy="42" rx="9" ry="12" transform="rotate(20 74 42)" />
      <path d="M50 48c-13 0-23 10-23 22 0 11 9 18 23 18s23-7 23-18c0-12-10-22-23-22z" />
    </svg>
  )
}

/** Cara de perro line-art, amistosa. */
export function DogFace({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M27 30C16 24 11 42 20 56" />
      <path d="M73 30C84 24 89 42 80 56" />
      <path d="M30 33C30 21 70 21 70 33c8 8 7 30-6 39-8 6-20 6-28 0-13-9-14-31-6-39Z" />
      <circle cx="40" cy="48" r="3" fill="currentColor" stroke="none" />
      <circle cx="60" cy="48" r="3" fill="currentColor" stroke="none" />
      <ellipse cx="50" cy="62" rx="5" ry="4" fill="currentColor" stroke="none" />
      <path d="M50 66c-3 5-7 4-8 1M50 66c3 5 7 4 8 1" />
    </svg>
  )
}

/** Cara de gato line-art. */
export function CatFace({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M30 38 26 18l20 12" />
      <path d="M70 38 74 18 54 30" />
      <path d="M30 34c-4 18 3 38 20 38s24-20 20-38" />
      <circle cx="41" cy="48" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="59" cy="48" r="2.6" fill="currentColor" stroke="none" />
      <path d="M50 56v4" />
      <path d="M50 60c-2 3-5 3-7 2M50 60c2 3 5 3 7 2" />
      <path d="M30 54 16 51M30 60 17 61M70 54 84 51M70 60 83 61" />
    </svg>
  )
}

/** Hueso. */
export function Bone({ className }: IconProps) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden className={className}>
      <path d="M28 32a11 11 0 0 0-9 17 11 11 0 0 0 1 18 11 11 0 0 0 17-7l24-24a11 11 0 0 0 18-1 11 11 0 0 0-1-18 11 11 0 0 0-18 1L36 42a11 11 0 0 0-8-10Z" />
    </svg>
  )
}

/** Vacuna / jeringa. */
export function Vaccine({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M58 20 80 42" />
      <path d="M40 38 62 60 44 78a14 14 0 0 1-20 0l-2-2a14 14 0 0 1 0-20Z" />
      <path d="M52 26 74 48" />
      <path d="M30 56 44 70" />
      <path d="M18 82 26 74" />
    </svg>
  )
}

/** Corazón con latido (ECG). */
export function HeartPulse({ className }: IconProps) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <path
        d="M50 86 18 54a18 18 0 0 1 25-26l7 7 7-7a18 18 0 0 1 25 26Z"
        fill="currentColor"
      />
      <path
        d="M24 52h12l5-10 7 18 6-12 4 4h14"
        fill="none"
        stroke="#fff"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
