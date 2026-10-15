-- ============================================================================
-- 057 — Contador de uso del panel
--
-- `usuarios.last_login` solo se escribe al registrarse: la sesión de Google se
-- renueva sola y nadie vuelve a "iniciar sesión", así que no dice quién usa el
-- panel. Acá se cuenta cada vez que alguien del equipo de una veterinaria abre
-- su panel: una fila por usuario, veterinaria y día (hora de Argentina), con
-- cuántas veces lo abrió y la primera y la última.
--
-- - Lo escribe solo la RPC `registrar_actividad`, que llama el layout del
--   panel. Los ingresos del superadmin (que entra a mirar paneles ajenos) no
--   cuentan.
-- - Solo el superadmin lo lee. No hay policies de escritura.
--
-- Arranca vacío: no hay forma de reconstruir el uso anterior. Idempotente.
-- ============================================================================

create table if not exists public.actividad_panel (
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  tenant_id   text not null references public.tenants(slug) on delete cascade,
  dia         date not null,
  aperturas   integer not null default 1 check (aperturas > 0),
  primera     timestamptz not null default now(),
  ultima      timestamptz not null default now(),
  primary key (usuario_id, tenant_id, dia)
);

create index if not exists actividad_panel_tenant_dia_idx on public.actividad_panel(tenant_id, dia);
create index if not exists actividad_panel_dia_idx on public.actividad_panel(dia);

alter table public.actividad_panel enable row level security;

drop policy if exists actividad_panel_superadmin on public.actividad_panel;
create policy actividad_panel_superadmin on public.actividad_panel
  for select to authenticated using (public.es_superadmin());

create or replace function public.registrar_actividad(p_tenant text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  -- Solo el equipo de la veterinaria: un superadmin mirando no es uso real.
  if not exists (
    select 1 from public.usuarios u
    where u.id = v_uid and u.role in ('veterinario', 'empleado') and u.tenant_id = p_tenant
  ) then
    return;
  end if;

  insert into public.actividad_panel (usuario_id, tenant_id, dia)
  values (v_uid, p_tenant, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
  on conflict (usuario_id, tenant_id, dia) do update
    set aperturas = public.actividad_panel.aperturas + 1,
        ultima = now();
end $$;

revoke all on function public.registrar_actividad(text) from public, anon;
grant execute on function public.registrar_actividad(text) to authenticated;
