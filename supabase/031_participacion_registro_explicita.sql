-- ============================================================================
-- 031. La mecánica "cliente registrado" pasa a requerir participación
-- explícita por sorteo, igual que la de foto.
--
-- Antes, `chance_por_registro` contaba TODOS los clientes de la base para
-- CUALQUIER sorteo activo, sin que hicieran nada: un cliente viejo sumaba
-- chance en un sorteo nuevo sin enterarse. Ahora usa la misma tabla
-- `sorteo_participaciones` que ya tenía la mecánica de foto: hay que tocar
-- "Registrate y participá" en el sorteo puntual para sumar esa chance ahí.
-- ============================================================================

alter table public.sorteo_participaciones
  drop constraint if exists sorteo_participaciones_tipo_check;

alter table public.sorteo_participaciones
  add constraint sorteo_participaciones_tipo_check check (tipo in ('foto_mascota', 'registro'));

-- Antes exigía foto: una participación de tipo 'registro' no tiene ninguna.
alter table public.sorteo_participaciones
  alter column foto_url drop not null;

create or replace function public.registrar_participacion_registro_publico(
  p_tenant    text,
  p_sorteo_id uuid,
  p_dni       text
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

  insert into public.sorteo_participaciones (sorteo_id, cliente_id, tipo)
  values (p_sorteo_id, v_cliente.id, 'registro')
  on conflict (sorteo_id, cliente_id, tipo) do nothing
  returning * into v_resultado;

  if v_resultado.id is null then
    select * into v_resultado from public.sorteo_participaciones
      where sorteo_id = p_sorteo_id and cliente_id = v_cliente.id and tipo = 'registro';
  end if;

  return v_resultado;
end $$;

grant execute on function public.registrar_participacion_registro_publico(text, uuid, text) to anon, authenticated;
