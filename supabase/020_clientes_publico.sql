-- ============================================================================
-- 020 — Alta de cliente/mascota desde el formulario público de turno
--
-- Bug: reservar turno sin sesión tiraba 401 "new row violates row-level
-- security policy for table clientes". Las policies de `clientes` y
-- `mascotas` solo dejan pasar a `es_staff(tenant_id)` o al propio cliente
-- (por email, vía Supabase Auth) — un visitante anónimo sacando turno no es
-- ninguna de las dos cosas.
--
-- `turnos` ya resolvía esto con una función `security definer` (crear_turno,
-- ver 002_turnos_rpc.sql) que corre con los privilegios del dueño de la
-- función, no los del caller, y por lo tanto no pasa por RLS. Estas
-- funciones siguen el mismo patrón para clientes/mascotas, así el
-- formulario público (turno + "Registrarme como cliente") puede dar de alta
-- sin necesitar login ni ser staff.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- slug_mascota: réplica de toId()/mascotaDocId() en lib/supabase/ids.ts
-- ("nombre-tipo" sin tildes ni espacios), para que el slug generado acá
-- coincida con el que ya calcula el cliente.
-- ----------------------------------------------------------------------------
create or replace function public.slug_mascota(p_nombre text, p_tipo text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(
          coalesce(p_nombre, ''),
          'áéíóúüñÁÉÍÓÚÜÑ',
          'aeiouunAEIOUUN'
        )),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+)|(-+$)', '', 'g'
    ), ''
  ), 'sin-nombre')
  || '-' ||
  coalesce(nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(
          coalesce(p_tipo, ''),
          'áéíóúüñÁÉÍÓÚÜÑ',
          'aeiouunAEIOUUN'
        )),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+)|(-+$)', '', 'g'
    ), ''
  ), 'sin-nombre')
$$;

-- ----------------------------------------------------------------------------
-- buscar_cliente_publico: busca por DNI o email dentro del tenant.
-- Reemplaza el select directo a `clientes` que hacían useClienteByDNI /
-- useClienteByEmail (bloqueado por RLS para un visitante anónimo).
-- ----------------------------------------------------------------------------
create or replace function public.buscar_cliente_publico(
  p_tenant text,
  p_dni    text default null,
  p_email  text default null
)
returns setof public.clientes
language sql
stable
security definer
set search_path = public
as $$
  select * from public.clientes
  where tenant_id = p_tenant
    and (
      (p_dni   is not null and dni = p_dni)
      or
      (p_email is not null and lower(email) = lower(p_email))
    )
  limit 1
$$;

grant execute on function public.buscar_cliente_publico(text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- guardar_cliente_publico: crea el cliente o, si ya existe uno con ese DNI en
-- el tenant, lo actualiza y audita los cambios en `historial_datos` — mismo
-- comportamiento que createCliente() en lib/supabase/clientes.ts.
-- ----------------------------------------------------------------------------
create or replace function public.guardar_cliente_publico(
  p_tenant text,
  p_datos  jsonb
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dni       text := nullif(trim(p_datos->>'dni'), '');
  v_existente public.clientes;
  v_cambios   jsonb;
  v_campo     text;
  v_nuevo     text;
  v_actual    text;
  v_resultado public.clientes;
begin
  if v_dni is not null then
    select * into v_existente from public.clientes
      where tenant_id = p_tenant and dni = v_dni limit 1;
  end if;

  if v_existente.id is not null then
    v_cambios := coalesce(v_existente.historial_datos, '[]'::jsonb);
    foreach v_campo in array array['nombre', 'telefono', 'email', 'domicilio'] loop
      v_nuevo := p_datos->>v_campo;
      v_actual := case v_campo
        when 'nombre'    then v_existente.nombre
        when 'telefono'  then v_existente.telefono
        when 'email'     then v_existente.email
        when 'domicilio' then v_existente.domicilio
      end;
      if v_nuevo is not null and v_nuevo is distinct from v_actual then
        v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
          'campo', v_campo,
          'valorAnterior', coalesce(v_actual, ''),
          'valorNuevo', v_nuevo,
          'fechaCambio', now()
        ));
      end if;
    end loop;

    update public.clientes set
      nombre          = coalesce(p_datos->>'nombre', nombre),
      telefono        = coalesce(p_datos->>'telefono', telefono),
      email           = coalesce(p_datos->>'email', email),
      domicilio       = coalesce(p_datos->>'domicilio', domicilio),
      historial_datos = v_cambios
    where id = v_existente.id
    returning * into v_resultado;

    return v_resultado;
  end if;

  insert into public.clientes (
    tenant_id, nombre, telefono, email, dni, domicilio, historial_datos
  ) values (
    p_tenant,
    coalesce(p_datos->>'nombre', ''),
    coalesce(p_datos->>'telefono', ''),
    coalesce(p_datos->>'email', ''),
    v_dni,
    p_datos->>'domicilio',
    '[]'::jsonb
  )
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.guardar_cliente_publico(text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- actualizar_cliente_publico: update puntual (cuando el visitante edita sus
-- datos ya cargados). Valida tenant_id para que no se pueda tocar un cliente
-- de otro tenant pasando un id ajeno.
-- ----------------------------------------------------------------------------
create or replace function public.actualizar_cliente_publico(
  p_tenant     text,
  p_cliente_id uuid,
  p_datos      jsonb
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existente public.clientes;
  v_cambios   jsonb;
  v_campo     text;
  v_nuevo     text;
  v_actual    text;
  v_resultado public.clientes;
begin
  select * into v_existente from public.clientes
    where id = p_cliente_id and tenant_id = p_tenant;
  if v_existente.id is null then
    raise exception 'CLIENTE_NOT_FOUND';
  end if;

  v_cambios := coalesce(v_existente.historial_datos, '[]'::jsonb);
  foreach v_campo in array array['nombre', 'telefono', 'email', 'domicilio'] loop
    v_nuevo := p_datos->>v_campo;
    v_actual := case v_campo
      when 'nombre'    then v_existente.nombre
      when 'telefono'  then v_existente.telefono
      when 'email'     then v_existente.email
      when 'domicilio' then v_existente.domicilio
    end;
    if v_nuevo is not null and v_nuevo is distinct from v_actual then
      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
        'campo', v_campo,
        'valorAnterior', coalesce(v_actual, ''),
        'valorNuevo', v_nuevo,
        'fechaCambio', now()
      ));
    end if;
  end loop;

  update public.clientes set
    nombre          = coalesce(p_datos->>'nombre', nombre),
    telefono        = coalesce(p_datos->>'telefono', telefono),
    email           = coalesce(p_datos->>'email', email),
    dni             = case when p_datos ? 'dni' then nullif(p_datos->>'dni', '') else dni end,
    domicilio       = coalesce(p_datos->>'domicilio', domicilio),
    historial_datos = v_cambios
  where id = p_cliente_id
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.actualizar_cliente_publico(text, uuid, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_mascotas_publico: reemplaza el select directo a `mascotas` que
-- hacían useClienteByDNI / useClienteByEmail para listar las mascotas del
-- cliente encontrado.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_mascotas_publico(
  p_tenant     text,
  p_cliente_id uuid
)
returns setof public.mascotas
language sql
stable
security definer
set search_path = public
as $$
  select * from public.mascotas
  where tenant_id = p_tenant and cliente_id = p_cliente_id
  order by nombre
$$;

grant execute on function public.obtener_mascotas_publico(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- guardar_mascota_publico: crea la mascota (o reutiliza la existente si ya
-- había una con el mismo nombre+tipo, igual que createMascota()) y su
-- registro de historia clínica consolidada en la misma transacción.
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
  -- El cliente tiene que existir y pertenecer a este tenant.
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
    raza, peso, slug
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
-- actualizar_mascota_publico: update puntual, valida tenant vía el cliente.
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
    -- El QR de libreta lo genera el staff; sólo se toca si viene explícito.
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
