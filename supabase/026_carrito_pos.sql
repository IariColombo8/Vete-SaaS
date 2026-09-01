-- ============================================================================
-- 025_carrito_pos.sql — Carrito de mostrador compartido y persistente
--
-- Una sola fila por tenant con el armado completo de "Vender" (productos,
-- cliente, medio de pago, descuento). Permite abrir el POS desde el celu y la
-- compu a la vez y ver el mismo carrito: el cliente hace upsert de esta fila
-- (debounced) y escucha cambios por Supabase Realtime.
--
-- `client_id` identifica al dispositivo que escribió por última vez, para que
-- ese mismo dispositivo ignore el eco de su propio write en el realtime.
-- ============================================================================

create table if not exists public.carrito_pos (
  tenant_id  text primary key references public.tenants(slug) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  client_id  text,
  updated_at timestamptz not null default now()
);

alter table public.carrito_pos enable row level security;

drop policy if exists carrito_pos_staff on public.carrito_pos;
create policy carrito_pos_staff on public.carrito_pos
  for all using (es_staff(tenant_id)) with check (es_staff(tenant_id));

do $$ begin
  alter publication supabase_realtime add table public.carrito_pos;
exception when duplicate_object then null; end $$;
