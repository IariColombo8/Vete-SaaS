-- ============================================================================
-- Diagnóstico — qué hay realmente en la base para VipVet
--
-- Una sola query, un solo resultado: el SQL Editor de Supabase muestra
-- únicamente la salida del ÚLTIMO select del script, así que todo va junto.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- No escribe nada, solo lee.
-- ============================================================================

with tenants_existentes as (
  select string_agg(slug || ' (' || coalesce(nombre, 'sin nombre') || ', plan ' || plan || ')', ' | ' order by slug) as v
    from public.tenants
)
select * from (
  -- Lo primero que hay que confirmar: que el slug sea exactamente 'vipvet'.
  -- Si el tenant se llama distinto, TODOS los seeds escribieron en el vacío.
  select 0 as orden, 'tenants en la base' as que, (select v from tenants_existentes) as valor
  union all
  select 1, '¿existe el slug "vipvet"?',
         case when exists (select 1 from public.tenants where slug = 'vipvet')
              then 'SÍ' else 'NO ← acá está el problema' end
  union all
  select 2, 'productos',            (select count(*)::text from public.productos            where tenant_id = 'vipvet')
  union all
  select 3, 'productos con marca',  (select count(*)::text from public.productos            where tenant_id = 'vipvet' and marca is not null and marca <> '')
  union all
  select 4, 'productos con imagen', (select count(*)::text from public.productos            where tenant_id = 'vipvet' and imagen_url is not null and imagen_url <> '')
  union all
  select 5, 'clientes',             (select count(*)::text from public.clientes             where tenant_id = 'vipvet')
  union all
  select 6, 'mascotas',             (select count(*)::text from public.mascotas             where tenant_id = 'vipvet')
  union all
  select 7, 'turnos',               (select count(*)::text from public.turnos               where tenant_id = 'vipvet')
  union all
  select 8, 'historias',            (select count(*)::text from public.historias            where tenant_id = 'vipvet')
  union all
  select 9, 'historia_clinica',     (select count(*)::text from public.historia_clinica     where tenant_id = 'vipvet')
  union all
  select 10, 'libretas_publicas',   (select count(*)::text from public.libretas_publicas    where tenant_id = 'vipvet')
  union all
  select 11, 'recordatorios',       (select count(*)::text from public.recordatorios_vacunas where tenant_id = 'vipvet')
  union all
  select 12, 'dias_bloqueados',     (select count(*)::text from public.dias_bloqueados      where tenant_id = 'vipvet')
  union all
  select 13, 'turno_config',        (select count(*)::text from public.turno_config         where tenant_id = 'vipvet')
  union all
  select 14, 'ventas',              (select count(*)::text from public.ventas               where tenant_id = 'vipvet')
  union all
  select 15, 'venta_items',         (select count(*)::text from public.venta_items          where tenant_id = 'vipvet')
  union all
  select 16, 'cajas',               (select count(*)::text from public.cajas                where tenant_id = 'vipvet')
  union all
  -- Si estos dicen SÍ, el seed correspondiente se saltea solo por el guard de
  -- idempotencia y hay que correr su bloque de LIMPIEZA antes de regenerar.
  select 17, 'el seed clínico se saltearía?',
         case when exists (select 1 from public.mascotas where tenant_id = 'vipvet')
              then 'SÍ — ya hay mascotas' else 'no' end
  union all
  select 18, 'el seed de ventas se saltearía?',
         case when exists (select 1 from public.ventas where tenant_id = 'vipvet')
              then 'SÍ — ya hay ventas' else 'no' end
  union all
  -- Los seeds escriben como owner y saltean RLS; la app lee como el usuario
  -- logueado. Si hay datos pero la app no los muestra, el problema es este.
  select 19, 'usuarios con acceso a vipvet',
         coalesce((select string_agg(coalesce(email, id::text) || ' → ' || role::text, ' | ')
                     from public.usuarios where tenant_id = 'vipvet'),
                  'NINGUNO ← la app no va a ver nada aunque los datos estén')
) d
order by orden;
