-- ============================================================================
-- 046 — Firma del profesional POR TENANT, no por usuario.
--
-- Bug real: la firma vivía en columnas de `usuarios` (038), o sea una sola por
-- cuenta. Una cuenta que opera en más de una veterinaria (superadmin/soporte,
-- o un veterinario que atiende en dos clínicas) compartía la misma firma en
-- todas: al cambiarla en una, cambiaba en las otras.
--
-- Ahora cada (usuario, tenant) tiene su propia fila en `firmas_profesionales`.
-- Las columnas viejas de `usuarios` quedan sin uso (no se borran para no
-- romper nada que todavía las lea).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create table if not exists public.firmas_profesionales (
  usuario_id         uuid not null references public.usuarios(id) on delete cascade,
  tenant_id          text not null references public.tenants(slug) on delete cascade,
  nombre_profesional text,
  especialidad       text not null default 'Médico Veterinario',
  matricula          text,
  firma_url          text,
  sello_url          text,
  updated_at         timestamptz not null default now(),
  primary key (usuario_id, tenant_id)
);

create index if not exists firmas_profesionales_tenant_idx on public.firmas_profesionales(tenant_id);

alter table public.firmas_profesionales enable row level security;

-- Cada uno lee y edita solo SU firma, y solo en un tenant donde es staff.
drop policy if exists firmas_self_select on public.firmas_profesionales;
drop policy if exists firmas_self_insert on public.firmas_profesionales;
drop policy if exists firmas_self_update on public.firmas_profesionales;
drop policy if exists firmas_self_delete on public.firmas_profesionales;

create policy firmas_self_select on public.firmas_profesionales for select
  using (usuario_id = auth.uid() and public.es_staff(tenant_id));
create policy firmas_self_insert on public.firmas_profesionales for insert
  with check (usuario_id = auth.uid() and public.es_staff(tenant_id));
create policy firmas_self_update on public.firmas_profesionales for update
  using (usuario_id = auth.uid() and public.es_staff(tenant_id))
  with check (usuario_id = auth.uid() and public.es_staff(tenant_id));
create policy firmas_self_delete on public.firmas_profesionales for delete
  using (usuario_id = auth.uid() and public.es_staff(tenant_id));

-- Migración de datos: la firma vieja se copia SOLO al tenant propio del
-- usuario (`usuarios.tenant_id`). Una cuenta sin tenant (superadmin) no se
-- puede asignar a ninguno sin adivinar: tiene que cargarla en cada veterinaria.
insert into public.firmas_profesionales
  (usuario_id, tenant_id, nombre_profesional, especialidad, matricula, firma_url, sello_url)
select id, tenant_id, nombre_profesional, coalesce(especialidad, 'Médico Veterinario'), matricula, firma_url, sello_url
from public.usuarios
where tenant_id is not null
  and (firma_url is not null or sello_url is not null
       or coalesce(trim(nombre_profesional), '') <> '' or coalesce(trim(matricula), '') <> '')
on conflict (usuario_id, tenant_id) do nothing;

-- Firma de un usuario en un tenant, para el comprobante (sin sesión: "Mi
-- Historia"). Solo expone lo que va impreso en el papel. Si el usuario no
-- cargó firma en ese tenant, devuelve igual su display_name (columnas de
-- firma en null) para que el comprobante tenga al menos un nombre.
create or replace function public.obtener_firma_profesional(p_usuario_id uuid, p_tenant_id text)
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
  select u.display_name, f.nombre_profesional, f.especialidad, f.matricula, f.firma_url, f.sello_url
  from public.usuarios u
  left join public.firmas_profesionales f
    on f.usuario_id = u.id and f.tenant_id = p_tenant_id
  where u.id = p_usuario_id
$$;

grant execute on function public.obtener_firma_profesional(uuid, text) to anon, authenticated;

-- Respaldo de 045, ahora leyendo la firma de ESE tenant.
create or replace function public.obtener_firma_veterinario_tenant(p_tenant_id text)
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
  select u.display_name, f.nombre_profesional, f.especialidad, f.matricula, f.firma_url, f.sello_url
  from public.firmas_profesionales f
  join public.usuarios u on u.id = f.usuario_id
  where f.tenant_id = p_tenant_id
    and coalesce(trim(f.nombre_profesional), '') <> ''
    and coalesce(trim(f.matricula), '') <> ''
    and coalesce(f.firma_url, '') <> ''
  order by (u.role = 'veterinario') desc, f.updated_at asc
  limit 1
$$;

grant execute on function public.obtener_firma_veterinario_tenant(text) to anon, authenticated;
