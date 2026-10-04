import Link from "next/link"
import { Paw } from "@/components/landing/pet-art"
import { SERVITEC } from "@/lib/marca"

export function SaasFooter() {
  return (
    <footer className="bg-cream border-t border-warm-border py-12">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral">
              <Paw className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-semibold text-ink">
              Vet<span className="text-coral">Panel</span>
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
            <a href="#caracteristicas" className="text-sm text-ink-muted hover:text-coral transition-colors">
              Características
            </a>
            <a href="#precios" className="text-sm text-ink-muted hover:text-coral transition-colors">
              Precios
            </a>
            <Link href="/blog" className="text-sm text-ink-muted hover:text-coral transition-colors">
              Blog
            </Link>
            <Link href="/login" className="text-sm text-ink-muted hover:text-coral transition-colors">
              Iniciar Sesión
            </Link>
          </div>
          <div className="text-center text-xs text-ink-muted/70 md:text-right">
            <p>© {new Date().getFullYear()} VetPanel · Hecho con cariño para las mascotas 🐾</p>
            <p className="mt-1">
              Desarrollado por{" "}
              <a
                href={SERVITEC.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink-muted hover:text-coral transition-colors"
              >
                {SERVITEC.nombre}
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
