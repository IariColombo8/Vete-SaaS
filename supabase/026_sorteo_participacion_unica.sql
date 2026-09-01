-- ============================================================================
-- 026. Una sola participación por foto por cliente y sorteo + re-creación de
-- la RPC pública (por si 025 no llegó a crearla — reportado 404 en el banner).
--
-- Antes, cada visita al banner podía insertar una fila nueva en
-- `sorteo_participaciones`, inflando las chances de un mismo cliente. Ahora
-- hay una sola fila por (sorteo, cliente): volver a subir una foto actualiza
-- la existente en vez de sumar otra.
-- ============================================================================

-- 1. Un cliente participa una sola vez por sorteo con la mecánica de foto ----

alter table public.sorteo_participaciones
  drop constraint if exists sorteo_participaciones_unica_uk;

alter table public.sorteo_participaciones
  add constraint sorteo_participaciones_unica_uk unique (sorteo_id, cliente_id, tipo);

-- 2. RPC: buscar si el cliente ya participó con foto en este sorteo ---------

create or replace function public.obtener_participacion_foto_publico(
  p_tenant    text,
  p_sorteo_id uuid,
  p_dni       text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_foto    text;
begin
  select * into v_cliente from public.clientes where tenant_id = p_tenant and dni = p_dni limit 1;
  if v_cliente.id is null then
    return null;
  end if;

  select foto_url into v_foto from public.sorteo_participaciones
    where sorteo_id = p_sorteo_id and cliente_id = v_cliente.id and tipo = 'foto_mascota';

  return v_foto;
end $$;

grant execute on function public.obtener_participacion_foto_publico(text, uuid, text) to anon, authenticated;

-- 3. Re-crear la RPC de alta, ahora con upsert (reemplaza la foto anterior) -
-- `create or replace` de nuevo por si 025 no llegó a aplicarse completo.

create or replace function public.registrar_participacion_foto_publico(
  p_tenant    text,
  p_sorteo_id uuid,
  p_dni       text,
  p_foto_url  text
)
returns public.sorteo_participaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente   public.clientes;
  v_sorteo    public.sorteos;
  v_resultado public.sorteo_participaciones;
begin
  select * into v_sorteo from public.sorteos where id = p_sorteo_id and tenant_id = p_tenant;
  if v_sorteo.id is null then
    raise exception 'SORTEO_NOT_FOUND';
  end if;

  select * into v_cliente from public.clientes where tenant_id = p_tenant and dni = p_dni limit 1;
  if v_cliente.id is null then
    raise exception 'CLIENTE_NOT_FOUND';
  end if;

  insert into public.sorteo_participaciones (sorteo_id, cliente_id, tipo, foto_url)
  values (p_sorteo_id, v_cliente.id, 'foto_mascota', p_foto_url)
  on conflict (sorteo_id, cliente_id, tipo) do update set foto_url = excluded.foto_url
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.registrar_participacion_foto_publico(text, uuid, text, text) to anon, authenticated;
