import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"
import matter from "gray-matter"

/**
 * Blog file-based: los posts viven en `content/blog/*.md` con frontmatter
 * (title, description, date, author?). Se leen en build (server-only).
 */

const BLOG_DIR = path.join(process.cwd(), "content", "blog")

export interface PostMeta {
  slug: string
  title: string
  description: string
  date: string
  author?: string
}

export interface Post extends PostMeta {
  content: string
}

function parseFile(file: string): Post | null {
  const slug = file.replace(/\.md$/, "")
  const raw = readFileSync(path.join(BLOG_DIR, file), "utf8")
  const { data, content } = matter(raw)
  if (!data.title) return null
  return {
    slug,
    title: String(data.title),
    description: String(data.description ?? ""),
    date: String(data.date ?? ""),
    author: data.author ? String(data.author) : undefined,
    content,
  }
}

/** Lista de posts ordenados por fecha desc (solo metadata). */
export function getAllPosts(): PostMeta[] {
  if (!existsSync(BLOG_DIR)) return []
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(parseFile)
    .filter((p): p is Post => p !== null)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map(({ content: _content, ...meta }) => meta)
}

export function getPost(slug: string): Post | null {
  const file = `${slug}.md`
  if (!existsSync(path.join(BLOG_DIR, file))) return null
  return parseFile(file)
}

export function getAllSlugs(): string[] {
  if (!existsSync(BLOG_DIR)) return []
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
}
