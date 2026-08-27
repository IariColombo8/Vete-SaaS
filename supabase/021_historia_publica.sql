-- ============================================================================
-- 021 — Historia clínica pública por DNI + perfil de mascota
--
-- Bug/feature: un visitante sin sesión no puede ver la historia clínica ni
-- los turnos de su mascota (RLS de `historias`/`turnos` solo deja pasar a
-- staff o al dueño autenticado por email, ver policies en schema.sql). Estas
-- funciones siguen el mismo patrón `security definer` que
-- 020_clientes_publico.sql: corren con los privilegios del dueño de la
-- función, no los del caller, y validan `tenant_id` a mano para no filtrar
-- datos de otro tenant.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- foto_url: fondo de perfil opcional de la mascota, la sube el propio
-- visitante vía app/api/mascota-foto (con validación de ownership por DNI).
-- ----------------------------------------------------------------------------
alter table public.mascotas add column if not exists foto_url text;

-- ----------------------------------------------------------------------------
-- obtener_mascota_publico: una mascota puntual, para /mi-historia/[mascotaId].
-- Devuelve cliente_id para que la página pueda pedir los turnos del dueño.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_mascota_publico(
  p_tenant text,
  p_mascota_id uuid
)
returns public.mascotas
language sql
stable
security definer
set search_path = public
as $$
  select * from public.mascotas
  where tenant_id = p_tenant and id = p_mascota_id
$$;

grant execute on function public.obtener_mascota_publico(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_historias_publico: historias de una mascota, valida que sea del
-- tenant. Mismo orden que getHistorias() (fecha desc).
-- ----------------------------------------------------------------------------
create or replace function public.obtener_historias_publico(
  p_tenant text,
  p_mascota_id uuid
)
returns setof public.historias
language sql
stable
security definer
set search_path = public
as $$
  select h.* from public.historias h
  join public.mascotas m on m.id = h.mascota_id
  where m.tenant_id = p_tenant and h.mascota_id = p_mascota_id
  order by h.fecha_atencion desc
$$;

grant execute on function public.obtener_historias_publico(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_turnos_publico: turnos de un cliente, valida que sea del tenant.
-- La página de perfil filtra en el cliente por mascota_id.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_turnos_publico(
  p_tenant text,
  p_cliente_id uuid
)
returns setof public.turnos
language sql
stable
security definer
set search_path = public
as $$
  select t.* from public.turnos t
  where t.tenant_id = p_tenant and t.cliente_id = p_cliente_id
  order by t.fecha desc, t.hora desc
$$;

grant execute on function public.obtener_turnos_publico(text, uuid) to anon, authenticated;
