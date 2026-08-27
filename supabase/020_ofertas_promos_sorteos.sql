-- ============================================================================
-- 020. Promociones y sorteos.
--
-- Las ofertas siguen viviendo en `productos.oferta_*` (016/018) — acá solo se
-- agregan promociones (combos de varios productos a precio fijo) y sorteos
-- (chances calculadas on-demand desde `ventas`, no persistidas).
-- ============================================================================

-- 1. PROMOCIONES ------------------------------------------------------------

create table if not exists public.promociones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references public.tenants(slug),
  nombre        text not null,
  descripcion   text,
  precio_final  numeric(12,2) not null check (precio_final >= 0),
  activa        boolean not null default true,
  desde         date,
  hasta         date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint promociones_fechas_ck check (hasta is null or desde is null or hasta >= desde)
);

create index if not exists promociones_tenant_idx on public.promociones(tenant_id);

create table if not exists public.promocion_items (
  id            uuid primary key default gen_random_uuid(),
  promocion_id  uuid not null references public.promociones(id) on delete cascade,
  producto_id   uuid not null references public.productos(id),
  cantidad      integer not null check (cantidad > 0)
);

create index if not exists promocion_items_promocion_idx on public.promocion_items(promocion_id);
create index if not exists promocion_items_producto_idx  on public.promocion_items(producto_id);

-- 2. SORTEOS -----------------------------------------------------------------

do $$ begin
  create type sorteo_estado as enum ('borrador', 'activo', 'finalizado');
exception when duplicate_object then null;
end $$;

create table if not exists public.sorteos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(slug),
  nombre      text not null,
  descripcion text,
  foto_url    text,
  desde       date not null,
  hasta       date not null,
  estado      sorteo_estado not null default 'borrador',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sorteos_fechas_ck check (hasta >= desde)
);

create index if not exists sorteos_tenant_idx on public.sorteos(tenant_id);

create table if not exists public.sorteo_premios (
  id          uuid primary key default gen_random_uuid(),
  sorteo_id   uuid not null references public.sorteos(id) on delete cascade,
  orden       integer not null,
  nombre      text not null,
  descripcion text,
  foto_url    text,
  constraint sorteo_premios_orden_uk unique (sorteo_id, orden)
);

create table if not exists public.sorteo_ganadores (
  id           uuid primary key default gen_random_uuid(),
  sorteo_id    uuid not null references public.sorteos(id) on delete cascade,
  premio_id    uuid not null references public.sorteo_premios(id) unique,
  cliente_id   uuid not null references public.clientes(id),
  venta_id     uuid not null references public.ventas(id),
  sorteado_en  timestamptz not null default now()
);

create index if not exists sorteo_ganadores_sorteo_idx on public.sorteo_ganadores(sorteo_id);

-- 3. TRIGGERS ------------------------------------------------------------------
-- Mismo patrón que `touch_productos` en 004: mantiene `updated_at` al día en
-- cada update, en vez de confiar en que el cliente lo mande.

drop trigger if exists touch_promociones on public.promociones;
create trigger touch_promociones before update on public.promociones
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_sorteos on public.sorteos;
create trigger touch_sorteos before update on public.sorteos
  for each row execute function public.touch_updated_at();

-- 4. RLS ----------------------------------------------------------------------
-- Mismo criterio que productos: solo staff del tenant, nada público.

alter table public.promociones      enable row level security;
alter table public.promocion_items  enable row level security;
alter table public.sorteos          enable row level security;
alter table public.sorteo_premios   enable row level security;
alter table public.sorteo_ganadores enable row level security;

drop policy if exists promociones_staff on public.promociones;
create policy promociones_staff on public.promociones for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

drop policy if exists promocion_items_staff on public.promocion_items;
create policy promocion_items_staff on public.promocion_items for all
  using (es_staff((select tenant_id from public.promociones where id = promocion_id)))
  with check (es_staff((select tenant_id from public.promociones where id = promocion_id)));

drop policy if exists sorteos_staff on public.sorteos;
create policy sorteos_staff on public.sorteos for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

drop policy if exists sorteo_premios_staff on public.sorteo_premios;
create policy sorteo_premios_staff on public.sorteo_premios for all
  using (es_staff((select tenant_id from public.sorteos where id = sorteo_id)))
  with check (es_staff((select tenant_id from public.sorteos where id = sorteo_id)));

drop policy if exists sorteo_ganadores_staff on public.sorteo_ganadores;
create policy sorteo_ganadores_staff on public.sorteo_ganadores for all
  using (es_staff((select tenant_id from public.sorteos where id = sorteo_id)))
  with check (es_staff((select tenant_id from public.sorteos where id = sorteo_id)));
