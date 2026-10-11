-- ============================================================================
-- 050 — Mercado Pago Point por veterinaria (cobro con la terminal del tenant)
--
-- Cada veterinaria conecta SU cuenta de Mercado Pago pegando su access token
-- en Configuración → Integraciones. Con ese token el servidor crea órdenes
-- (API Orders, `type: point`) en la terminal elegida; el mostrador espera la
-- aprobación y recién entonces registra la venta.
--
-- 1. `mp_point_config`: token y terminal elegida. RLS encendida y SIN policies:
--    el token no sale nunca al navegador. Solo lo leen las API routes con
--    service_role, que antes verifican que quien llama sea staff del tenant.
-- 2. `mp_point_cobros`: una fila por orden enviada a la terminal, con su
--    estado y el `payment_id` de MP. El staff la lee (historial, conciliación);
--    la escribe el servidor.
-- 3. `mp_point_estado(p_tenant)`: lo único que el cliente necesita saber
--    (¿está configurado? ¿qué terminal?) sin exponer el token.
-- 4. `ventas.mp_order_id` / `ventas.mp_payment_id`: la venta queda atada al
--    pago de MP para auditoría y, más adelante, para la factura electrónica.
--
-- Idempotente. Requiere `005_ventas.sql`.
-- ============================================================================

create table if not exists public.mp_point_config (
  tenant_id          text primary key references public.tenants(slug) on delete cascade,
  access_token       text not null,
  terminal_id        text,
  terminal_nombre    text,
  print_on_terminal  boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.mp_point_config enable row level security;
-- Sin policies a propósito: ni select ni update desde el cliente.

create table if not exists public.mp_point_cobros (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(slug) on delete cascade,
  order_id            text not null unique,
  external_reference  text not null,
  terminal_id         text not null,
  monto               numeric(12,2) not null check (monto > 0),
  descripcion         text,
  estado              text not null default 'created',
  estado_detalle      text,
  payment_id          text,
  venta_id            uuid references public.ventas(id) on delete set null,
  usuario_id          uuid references public.usuarios(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists mp_point_cobros_tenant_idx on public.mp_point_cobros (tenant_id, created_at desc);

alter table public.mp_point_cobros enable row level security;

drop policy if exists mp_point_cobros_read on public.mp_point_cobros;
create policy mp_point_cobros_read on public.mp_point_cobros
  for select using (public.es_staff(tenant_id));

alter table public.ventas add column if not exists mp_order_id   text;
alter table public.ventas add column if not exists mp_payment_id text;

-- ----------------------------------------------------------------------------
-- mp_point_estado: ¿el tenant tiene Point conectado? (sin token)
-- ----------------------------------------------------------------------------
create or replace function public.mp_point_estado(p_tenant text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.es_staff(p_tenant) then
      jsonb_build_object('configurado', false)
    else coalesce(
      (select jsonb_build_object(
          'configurado', true,
          'terminal_id', c.terminal_id,
          'terminal_nombre', c.terminal_nombre,
          'print_on_terminal', c.print_on_terminal
        )
        from public.mp_point_config c
       where c.tenant_id = p_tenant),
      jsonb_build_object('configurado', false)
    )
  end
$$;

grant execute on function public.mp_point_estado(text) to authenticated;
