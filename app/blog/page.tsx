import type { Metadata } from "next"
import Link from "next/link"
import { getAllPosts } from "@/lib/blog/posts"
import { ArrowRight } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app"

export const metadata: Metadata = {
  title: "Blog — VetPanel",
  description: "Guías y consejos para digitalizar y hacer crecer tu veterinaria.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    url: `${APP_URL}/blog`,
    title: "Blog — VetPanel",
    description: "Guías y consejos para digitalizar y hacer crecer tu veterinaria.",
  },
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <main className="bg-slate-950 min-h-screen">
      <section className="border-b border-slate-800 py-16 sm:py-20">
        <div className="container max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Blog</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white">Recursos para tu veterinaria</h1>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Guías prácticas para digitalizar tu clínica, mejorar la atención y hacer crecer tu negocio.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container max-w-3xl mx-auto px-4 sm:px-6 space-y-5">
          {posts.length === 0 ? (
            <p className="text-slate-400 text-center">Pronto vamos a publicar contenido.</p>
          ) : (
            posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block rounded-2xl border border-slate-800 bg-slate-900/50 p-6 hover:border-emerald-500/40 transition-colors group"
              >
                {post.date && (
                  <p className="text-xs text-slate-500 mb-2">
                    {new Date(post.date + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
                <h2 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">{post.title}</h2>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">{post.description}</p>
                <span className="inline-flex items-center gap-1 text-sm text-emerald-400 mt-3">
                  Leer más <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  )
}
