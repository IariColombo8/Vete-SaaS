-- ============================================================================
-- 014b_cuenta_corriente.sql — continúa 014_cuenta_corriente.sql
--
-- Correr DESPUÉS de que 014_cuenta_corriente.sql haya confirmado (los nuevos
-- valores de `medio_pago` tienen que existir ya committeados).
-- ============================================================================

-- ============================================================================
-- 1. VENTAS: columnas nuevas
-- ============================================================================

alter table public.ventas add column if not exists recargo         numeric(12,2) not null default 0;
alter table public.ventas add column if not exists cuotas          integer;
alter table public.ventas add column if not exists es_pago_cta_cte boolean not null default false;

alter table public.ventas drop constraint if exists ventas_recargo_ck;
alter table public.ventas add  constraint ventas_recargo_ck check (recargo >= 0);

alter table public.ventas drop constraint if exists ventas_cuotas_ck;
alter table public.ventas add  constraint ventas_cuotas_ck check (cuotas is null or cuotas > 0);

-- ============================================================================
-- 2. VENTA_PAGOS: desglose de "mixto"
-- ============================================================================

create table if not exists public.venta_pagos (
  id         uuid primary key default gen_random_uuid(),
  venta_id   uuid not null references public.ventas(id) on delete cascade,
  tenant_id  text not null references public.tenants(slug) on delete cascade,
  medio_pago medio_pago not null,
  monto      numeric(12,2) not null,

  constraint venta_pagos_monto_ck check (monto > 0),
  constraint venta_pagos_medio_ck check (medio_pago not in ('mixto', 'cuenta_corriente'))
);

create index if not exists idx_venta_pagos_venta on public.venta_pagos (venta_id);

-- ============================================================================
-- 3. CUENTA_CORRIENTE_MOVIMIENTOS
--
-- El saldo de un cliente es sum(monto) filter (tipo='venta') menos
-- sum(monto) filter (tipo='pago'). No se guarda un campo `saldo`: con el
-- volumen de una veterinaria (cientos de movimientos) calcularlo en la
-- consulta es más simple y no se puede desincronizar.
-- ============================================================================

create table if not exists public.cuenta_corriente_movimientos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null references public.tenants(slug) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  tipo           text not null,
  monto          numeric(12,2) not null,
  venta_id       uuid references public.ventas(id) on delete set null,
  observaciones  text not null default '',
  usuario_nombre text,
  created_at     timestamptz not null default now(),

  constraint cta_cte_mov_tipo_ck  check (tipo in ('venta', 'pago')),
  constraint cta_cte_mov_monto_ck check (monto > 0)
);

create index if not exists idx_cta_cte_cliente
  on public.cuenta_corriente_movimientos (tenant_id, cliente_id, created_at desc);

-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table public.venta_pagos                  enable row level security;
alter table public.cuenta_corriente_movimientos enable row level security;

drop policy if exists venta_pagos_read on public.venta_pagos;
create policy venta_pagos_read on public.venta_pagos for select
  using (es_staff(tenant_id));

drop policy if exists cta_cte_mov_read on public.cuenta_corriente_movimientos;
create policy cta_cte_mov_read on public.cuenta_corriente_movimientos for select
  using (es_staff(tenant_id));

-- ============================================================================
-- FIN de 014b
-- ============================================================================
