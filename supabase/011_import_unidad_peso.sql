-- ============================================================================
-- importar_productos: persiste "unidad" y "peso_kg".
--
-- La función ya persiste `marca` desde 008/009. El importador del navegador
-- (lib/productos/importar.ts) también manda `unidad` y `pesoKg` en cada fila,
-- pero hasta ahora se perdían: no había ninguna columna que los leyera desde
-- el jsonb. Esto agrega esos dos campos al mismo patrón que `marca`, sin
-- tocar el resto: el matching por nombre+categoría de 009 y el soporte de
-- "categoria" directa de 008 quedan intactos.
-- ============================================================================

create or replace function public.importar_productos(
  p_tenant_id  text,
  p_filas      jsonb,
  p_estrategia text default 'no_tocar'
) returns jsonb
language plpgsql
as $$
declare
  v_fila           jsonb;
  v_barra          text;
  v_codigo         text;
  v_nombre         text;
  v_marca          text;
  v_unidad         text;
  v_peso_kg        numeric;
  v_categoria      text;
  v_precio         numeric;
  v_costo          numeric;
  v_stock          numeric;
  v_bulto          integer;
  v_revisar        boolean;
  v_existente      public.productos%rowtype;
  v_stock_final    numeric;
  v_creados        integer := 0;
  v_actualizados   integer := 0;
  v_omitidos       integer := 0;
  v_con_warnings   integer := 0;
  v_errores        integer := 0;
  v_primer_error   text;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'Sin permisos sobre la veterinaria %', p_tenant_id;
  end if;
  if p_estrategia not in ('no_tocar', 'reemplazar', 'sumar', 'solo_nuevos') then
    raise exception 'Estrategia de stock inválida: %', p_estrategia;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb))
  loop
    v_barra   := nullif(trim(coalesce(v_fila->>'barra',  '')), '');
    v_codigo  := nullif(trim(coalesce(v_fila->>'codigo', '')), '');
    v_nombre  := nullif(trim(coalesce(v_fila->>'descripcion', '')), '');
    v_marca   := nullif(trim(coalesce(v_fila->>'marca', '')), '');
    v_unidad  := nullif(trim(coalesce(v_fila->>'unidad', '')), '');
    v_peso_kg := nullif(v_fila->>'pesoKg', '')::numeric;
    v_precio  := coalesce((v_fila->>'precio')::numeric, 0);
    v_costo   := nullif(v_fila->>'costo', '')::numeric;
    v_stock   := coalesce((v_fila->>'stock')::numeric, 0);
    v_bulto   := nullif(v_fila->>'bulto', '')::integer;
    v_revisar := coalesce((v_fila->>'revisar')::boolean, false);

    -- La categoría directa gana; si no vino, se arma como antes desde
    -- rubro/subrubro (compatibilidad con llamadores viejos).
    v_categoria := nullif(trim(coalesce(v_fila->>'categoria', '')), '');
    if v_categoria is null then
      v_categoria := trim(concat_ws(
        ' / ',
        nullif(trim(coalesce(v_fila->>'rubro',    '')), ''),
        nullif(trim(coalesce(v_fila->>'subrubro', '')), '')
      ));
    end if;

    -- Una fila sin nombre y sin ningún código no se puede identificar ni mostrar.
    if v_nombre is null and v_barra is null and v_codigo is null then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;
    if v_revisar then
      v_con_warnings := v_con_warnings + 1;
    end if;

    -- Cada fila va en su propio sub-bloque: una que choque (por ejemplo, un
    -- código repetido dentro del mismo Excel) se cuenta como error y se sigue,
    -- en vez de tirar abajo el lote entero de 200.
    begin
      -- Buscar por código de barras primero, después por código interno.
      select * into v_existente from public.productos
        where tenant_id = p_tenant_id and v_barra is not null and codigo_barras = v_barra
        limit 1;
      if not found and v_codigo is not null then
        select * into v_existente from public.productos
          where tenant_id = p_tenant_id and codigo = v_codigo
          limit 1;
      end if;

      -- Sin ningún código para matchear (ni en la fila ni, antes, en la base):
      -- se reconoce por nombre + categoría entre los productos que tampoco
      -- tienen código cargado. Sin esto, un producto sin código se duplicaría
      -- en cada reimportación de la misma lista.
      if not found and v_codigo is null and v_barra is null and v_nombre is not null then
        select * into v_existente from public.productos
          where tenant_id = p_tenant_id
            and codigo is null and codigo_barras is null
            and nombre = v_nombre
            and categoria = coalesce(v_categoria, '')
          limit 1;
      end if;

      if found then
        if p_estrategia = 'solo_nuevos' then
          v_omitidos := v_omitidos + 1;
          continue;
        end if;

        v_stock_final := case p_estrategia
          when 'reemplazar' then v_stock
          when 'sumar'      then v_existente.stock + v_stock
          else                   v_existente.stock
        end;

        update public.productos set
          nombre             = coalesce(v_nombre, v_existente.nombre),
          -- Un precio en 0 en el Excel casi siempre es una celda vacía, no una
          -- decisión de regalar el producto: se conserva el precio anterior.
          precio             = case when v_precio > 0 then v_precio else v_existente.precio end,
          costo              = coalesce(v_costo, v_existente.costo),
          categoria          = coalesce(nullif(v_categoria, ''), v_existente.categoria),
          marca              = coalesce(v_marca, v_existente.marca),
          unidad             = coalesce(v_unidad, v_existente.unidad),
          peso_kg            = coalesce(v_peso_kg, v_existente.peso_kg),
          codigo             = coalesce(v_codigo, v_existente.codigo),
          codigo_barras      = coalesce(v_barra,  v_existente.codigo_barras),
          stock              = greatest(v_stock_final, 0),
          unidades_por_bulto = coalesce(v_bulto, v_existente.unidades_por_bulto),
          revisar            = v_revisar
        where id = v_existente.id;

        v_actualizados := v_actualizados + 1;
      else
        insert into public.productos
          (tenant_id, codigo, codigo_barras, nombre, marca, categoria, precio, costo,
           stock, unidades_por_bulto, unidad, peso_kg, revisar)
        values
          (p_tenant_id, v_codigo, v_barra, coalesce(v_nombre, coalesce(v_barra, v_codigo)),
           v_marca, v_categoria, greatest(v_precio, 0), v_costo,
           greatest(v_stock, 0), v_bulto, coalesce(v_unidad, 'un'), v_peso_kg, v_revisar);

        v_creados := v_creados + 1;
      end if;
    exception when others then
      v_errores := v_errores + 1;
      if v_primer_error is null then
        v_primer_error := coalesce(v_nombre, v_barra, v_codigo) || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'creados',         v_creados,
    'actualizados',    v_actualizados,
    'omitidos',        v_omitidos + v_errores,
    'conAdvertencias', v_con_warnings,
    'errores',         v_errores,
    'primerError',     v_primer_error
  );
end $$;
