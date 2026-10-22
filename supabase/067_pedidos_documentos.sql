-- ============================================================================
-- 067 — Remito y factura del pedido web: el cliente los pide, el staff los
-- autoriza.
--
-- Pedido del dueño de VipVet: el comprador no ve el remito ni la factura por
-- su cuenta. En la página del pedido hay un botón "Solicitar"; la solicitud
-- aparece en Pedidos del panel y recién cuando el staff la autoriza el
-- comprador puede descargarlos.
--
--   documentos_estado: null (no pidió) → 'solicitado' → 'autorizado'
--
-- La solicitud la escribe la API (`/api/tienda/pedidos/[id]/documentos`, con
-- service_role, verificando que sea su pedido). La autorización es una RPC
-- de staff. La factura se sigue emitiendo igual al cobrarse: esto solo
-- decide si el comprador la puede ver.
--
-- Idempotente. Requiere 066.
-- ============================================================================

alter table public.pedidos add column if not exists documentos_estado text;
alter table public.pedidos drop constraint if exists pedidos_documentos_estado_ck;
alter table public.pedidos add constraint pedidos_documentos_estado_ck
  check (documentos_estado is null or documentos_estado in ('solicitado', 'autorizado'));
alter table public.pedidos add column if not exists documentos_solicitados_at timestamptz;
alter table public.pedidos add column if not exists documentos_autorizados_at timestamptz;

create or replace function public.autorizar_documentos_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant text;
begin
  select tenant_id into v_tenant from public.pedidos where id = p_pedido_id;
  if v_tenant is null or not public.es_staff(v_tenant) then
    raise exception 'No tenés permiso sobre este pedido';
  end if;

  update public.pedidos
    set documentos_estado = 'autorizado',
        documentos_autorizados_at = now(),
        updated_at = now()
    where id = p_pedido_id;
end $$;

grant execute on function public.autorizar_documentos_pedido(uuid) to authenticated;
