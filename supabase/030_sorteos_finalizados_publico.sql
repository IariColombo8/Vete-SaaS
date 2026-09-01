-- ============================================================================
-- 030. Historial público de sorteos finalizados + sus ganadores.
--
-- `sorteos_publico` (025) solo dejaba ver sorteos `activo` — necesario para
-- el banner del home. Para mostrar el historial de sorteos ya finalizados y
-- sus ganadores en el home, se amplía a también incluir `finalizado`.
--
-- Los ganadores NO se exponen vía policy directa sobre `sorteo_ganadores`
-- (evita tener que abrir `clientes` al público, que es estrictamente
-- staff-only en todo el resto del sistema). En cambio, una RPC
-- `security definer` devuelve solo lo necesario para el anuncio: premio,
-- nombre del ganador y fecha — nada más de la ficha del cliente.
-- ============================================================================

drop policy if exists sorteos_publico on public.sorteos;
create policy sorteos_publico on public.sorteos for select
  using (estado in ('activo', 'finalizado'));

drop policy if exists sorteo_premios_publico on public.sorteo_premios;
create policy sorteo_premios_publico on public.sorteo_premios for select
  using (
    exists (
      select 1 from public.sorteos s
      where s.id = sorteo_id and s.estado in ('activo', 'finalizado')
    )
  );

create or replace function public.obtener_ganadores_sorteo_publico(p_sorteo_id uuid)
returns table(premio_id uuid, cliente_id uuid, cliente_nombre text, sorteado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select g.premio_id, g.cliente_id, c.nombre, g.sorteado_en
  from public.sorteo_ganadores g
  join public.clientes c on c.id = g.cliente_id
  where g.sorteo_id = p_sorteo_id;
$$;

grant execute on function public.obtener_ganadores_sorteo_publico(uuid) to anon, authenticated;
