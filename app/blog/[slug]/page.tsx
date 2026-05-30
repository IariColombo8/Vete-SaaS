import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import { getPost, getAllSlugs } from "@/lib/blog/posts"
import { ArrowLeft } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app"

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return { title: "Artículo no encontrado — VetPanel" }
  return {
    title: `${post.title} — VetPanel`,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      url: `${APP_URL}/blog/${slug}`,
      title: post.title,
      description: post.description,
      publishedTime: post.date || undefined,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  return (
    <main className="bg-slate-950 min-h-screen py-12 sm:py-16">
      <article className="container max-w-2xl mx-auto px-4 sm:px-6">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 mb-8">
          <ArrowLeft className="h-4 w-4" /> Volver al blog
        </Link>

        <header className="mb-8">
          {post.date && (
            <p className="text-xs text-slate-500 mb-2">
              {new Date(post.date + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
              {post.author ? ` · ${post.author}` : ""}
            </p>
          )}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">{post.title}</h1>
        </header>

        <div
          className="max-w-none text-slate-300 leading-relaxed
            [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3
            [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-8 [&_h3]:mb-2
            [&_p]:my-4
            [&_a]:text-emerald-400 [&_a]:underline hover:[&_a]:text-emerald-300
            [&_strong]:text-white [&_strong]:font-semibold
            [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1
            [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6
            [&_hr]:my-8 [&_hr]:border-slate-800"
        >
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>
      </article>
    </main>
  )
}
