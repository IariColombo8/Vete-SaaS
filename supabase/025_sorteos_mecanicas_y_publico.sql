-- ============================================================================
-- 025. Mecánicas configurables de chances + banner público de sorteos.
--
-- Hasta acá un sorteo solo daba 1 chance por venta con cliente asociado. Se
-- agregan dos mecánicas más, configurables por sorteo desde el admin:
--   - "cliente registrado": 1 chance por ser cliente de la base (cualquiera,
--     sin importar cuándo se dio de alta).
--   - "compra": la de siempre (1 chance por venta), o por monto acumulado
--     (cada $X gastados = 1 chance), a elección del admin al crear el sorteo.
--   - "foto de mascota": 1 chance por subir una foto durante la vigencia del
--     sorteo (tabla sorteo_participaciones, ya creada a mano en el editor).
--
-- Además: policies de lectura pública (para el banner del home) y una RPC
-- pública para registrar la participación por foto sin necesitar sesión.
-- Idempotente — se puede correr de nuevo sin romper nada.
-- ============================================================================

-- 1. Columnas de configuración de mecánicas -----------------------------------

alter table public.sorteos
  add column if not exists chance_por_registro boolean not null default true,
  add column if not exists chance_por_compra    boolean not null default true,
  add column if not exists compra_modo          text not null default 'venta',
  add column if not exists compra_monto_umbral   numeric(12,2),
  add column if not exists chance_por_foto       boolean not null default false;

do $$ begin
  alter table public.sorteos
    add constraint sorteos_compra_modo_ck check (compra_modo in ('venta', 'monto'));
exception when duplicate_object then null;
end $$;

-- 2. Premio vinculado a un producto real (opcional) --------------------------

alter table public.sorteo_premios
  add column if not exists producto_id uuid references public.productos(id);

-- 3. Un ganador puede no tener venta asociada (chance de registro o de foto) --

alter table public.sorteo_ganadores
  alter column venta_id drop not null;

-- 4. Lectura pública para el banner del home ---------------------------------

drop policy if exists sorteos_publico on public.sorteos;
create policy sorteos_publico on public.sorteos for select
  using (estado = 'activo');

drop policy if exists sorteo_premios_publico on public.sorteo_premios;
create policy sorteo_premios_publico on public.sorteo_premios for select
  using (
    exists (select 1 from public.sorteos s where s.id = sorteo_id and s.estado = 'activo')
  );

-- 5. Storage: permitir que un visitante anónimo suba la foto de su mascota ---
-- Mismo bucket que el resto (`veterinarias`), pero solo para esta subcarpeta
-- específica — el resto del bucket sigue exigiendo `es_staff`.

drop policy if exists storage_write_sorteos_publico on storage.objects;
create policy storage_write_sorteos_publico on storage.objects for insert
  with check (
    bucket_id = 'veterinarias'
    and (storage.foldername(name))[2] = 'sorteos'
    and (storage.foldername(name))[3] = 'participaciones'
  );

-- 6. RPC pública: registrar la participación por foto -------------------------
-- Busca el cliente por DNI dentro del tenant (mismo criterio que
-- buscar_cliente_publico, ver 020_clientes_publico.sql). Si no existe, el
-- frontend debe mandar primero al alta de cliente y recién después reintentar.

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
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.registrar_participacion_foto_publico(text, uuid, text, text) to anon, authenticated;
