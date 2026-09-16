-- ============================================================================
-- 041 — Leer la firma de un veterinario sin sesión, para el comprobante.
--
-- Bug real: `usuarios_self_read` (RLS) solo deja leer la propia fila
-- (`id = auth.uid()`). Eso significa que ni un miembro del staff podía leer
-- la firma de OTRO veterinario (el que cargó la nota) para reimprimir su
-- orden, y mucho menos el dueño de la mascota desde "Mi Historia" (sin
-- sesión) podía descargar nada — la consulta volvía vacía en silencio, sin
-- error, así que ni se notaba por qué salía sin firma.
--
-- La firma/sello no es un dato sensible (está pensado para imprimirse), así
-- que un RPC `security definer` de solo lectura es seguro: no expone email,
-- rol ni tenant, solo lo que va en el papel.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create or replace function public.obtener_firma_veterinario_publico(p_usuario_id uuid)
returns table (
  display_name       text,
  nombre_profesional text,
  especialidad       text,
  matricula          text,
  firma_url          text,
  sello_url          text
)
language sql
stable
security definer
set search_path = public
as $$
  select display_name, nombre_profesional, especialidad, matricula, firma_url, sello_url
  from public.usuarios
  where id = p_usuario_id
$$;

grant execute on function public.obtener_firma_veterinario_publico(uuid) to anon, authenticated;
