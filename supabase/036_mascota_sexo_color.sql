-- ============================================================================
-- 036 — Sexo (obligatorio) y color (opcional) de la mascota.
--
-- Mismo criterio que el chip (024): campos estructurados en vez de texto
-- suelto, para que la libreta sanitaria en PDF los pueda mostrar como campo
-- propio en vez de "—". `sexo` es NOT NULL a nivel de aplicación (se valida
-- en el formulario), no acá: mascotas ya cargadas antes de esta migración no
-- tienen el dato, y no hay forma de inferirlo retroactivamente.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sexo_mascota') then
    create type sexo_mascota as enum ('macho', 'hembra');
  end if;
end $$;

alter table public.mascotas
  add column if not exists sexo  sexo_mascota,
  add column if not exists color text;

-- ----------------------------------------------------------------------------
-- guardar_mascota_publico: suma sexo / color al insert.
-- ----------------------------------------------------------------------------
create or replace function public.guardar_mascota_publico(
  p_tenant     text,
  p_cliente_id uuid,
  p_datos      jsonb
)
returns public.mascotas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug      text;
  v_dueño     public.clientes;
  v_resultado public.mascotas;
begin
  select * into v_dueño from public.clientes
    where id = p_cliente_id and tenant_id = p_tenant;
  if v_dueño.id is null then
    raise exception 'CLIENTE_NOT_FOUND';
  end if;

  v_slug := public.slug_mascota(p_datos->>'nombre', p_datos->>'tipo');

  select * into v_resultado from public.mascotas
    where cliente_id = p_cliente_id and slug = v_slug;

  if v_resultado.id is not null then
    return v_resultado;
  end if;

  insert into public.mascotas (
    tenant_id, cliente_id, nombre, tipo,
    edad, edad_valor, edad_unidad, edad_registrada_en,
    raza, peso, tiene_chip, chip_numero, sexo, color, slug
  ) values (
    p_tenant, p_cliente_id,
    coalesce(p_datos->>'nombre', ''),
    coalesce(p_datos->>'tipo', ''),
    p_datos->>'edad',
    nullif(p_datos->>'edadValor', '')::numeric,
    p_datos->>'edadUnidad',
    nullif(p_datos->>'edadRegistradaEn', '')::date,
    p_datos->>'raza',
    p_datos->>'peso',
    coalesce((p_datos->>'tieneChip')::boolean, false),
    p_datos->>'chipNumero',
    nullif(p_datos->>'sexo', '')::sexo_mascota,
    p_datos->>'color',
    v_slug
  )
  returning * into v_resultado;

  insert into public.historia_clinica (mascota_id, tenant_id)
  values (v_resultado.id, p_tenant)
  on conflict (mascota_id) do nothing;

  return v_resultado;
end $$;

grant execute on function public.guardar_mascota_publico(text, uuid, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- actualizar_mascota_publico: suma sexo / color al update.
-- ----------------------------------------------------------------------------
create or replace function public.actualizar_mascota_publico(
  p_tenant     text,
  p_mascota_id uuid,
  p_datos      jsonb
)
returns public.mascotas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado public.mascotas;
begin
  update public.mascotas set
    nombre             = coalesce(p_datos->>'nombre', nombre),
    tipo               = coalesce(p_datos->>'tipo', tipo),
    edad               = coalesce(p_datos->>'edad', edad),
    edad_valor         = coalesce(nullif(p_datos->>'edadValor', '')::numeric, edad_valor),
    edad_unidad        = coalesce(p_datos->>'edadUnidad', edad_unidad),
    edad_registrada_en = coalesce(nullif(p_datos->>'edadRegistradaEn', '')::date, edad_registrada_en),
    raza               = coalesce(p_datos->>'raza', raza),
    peso               = coalesce(p_datos->>'peso', peso),
    tiene_chip         = case when p_datos ? 'tieneChip' then (p_datos->>'tieneChip')::boolean else tiene_chip end,
    chip_numero        = case when p_datos ? 'chipNumero' then p_datos->>'chipNumero' else chip_numero end,
    sexo               = case when p_datos ? 'sexo' then nullif(p_datos->>'sexo', '')::sexo_mascota else sexo end,
    color              = case when p_datos ? 'color' then p_datos->>'color' else color end,
    libreta_token      = case when p_datos ? 'libretaToken' then p_datos->>'libretaToken' else libreta_token end,
    slug               = public.slug_mascota(
                            coalesce(p_datos->>'nombre', nombre),
                            coalesce(p_datos->>'tipo', tipo))
  where id = p_mascota_id and tenant_id = p_tenant
  returning * into v_resultado;

  if v_resultado.id is null then
    raise exception 'MASCOTA_NOT_FOUND';
  end if;

  return v_resultado;
end $$;

grant execute on function public.actualizar_mascota_publico(text, uuid, jsonb) to anon, authenticated;
