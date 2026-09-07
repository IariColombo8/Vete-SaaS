import type { PostgrestError } from "@supabase/supabase-js"

/**
 * Loguea y relanza un error de Supabase en vez de dejar que se descarte en
 * silencio. Sin esto, un `const { data } = await supabase...` deja `data` en
 * `null`/`undefined` cuando la query falla (RLS, FK ambiguo, etc.) y el
 * componente que llama no tiene forma de distinguir "sin resultados" de
 * "la query explotó".
 */
export function throwIfSupabaseError(error: PostgrestError | null, contexto: string): void {
  if (!error) return
  console.error(`${contexto}:`, error.message, error.details, error.hint, error.code)
  throw new Error(error.message || error.details || error.hint || contexto)
}
