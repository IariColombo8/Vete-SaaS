-- ============================================================================
-- 043. Fix de dos fugas cross-tenant encontradas en auditoría de seguridad.
--
-- 1. `productos_publico` (023_productos_lectura_publica.sql) exponía TODAS
--    las columnas (costo, margen, stock, stock_minimo, código de barras) de
--    CUALQUIER producto activo de CUALQUIER tenant a un usuario anónimo que
--    consultara la tabla directo con la clave `anon` (no solo vía las
--    funciones de la app, que sí acotan columnas). Se restringe a solo los
--    productos que el propio tenant marcó para mostrar en su vidriera
--    (`publicado_en_landing = true`), igual criterio que
--    `getProductosPublicados()` en lib/supabase/productos.ts.
--
-- 2. `storage_write_sorteos_publico` (025_sorteos_mecanicas_y_publico.sql)
--    no validaba el segmento de tenant en el path — cualquier anónimo podía
--    subir un archivo bajo `<cualquier-slug-ajeno>/sorteos/participaciones/…`.
--    Se agrega la validación de tenant vía `es_staff` OR existencia de un
--    sorteo activo para ese tenant (mismo espíritu que el resto de las
--    policies de storage_write, pero sin requerir sesión de staff ya que el
--    upload es de un visitante anónimo).
-- ============================================================================

drop policy if exists productos_publico on public.productos;
create policy productos_publico on public.productos for select
  using (activo = true and publicado_en_landing = true);

drop policy if exists storage_write_sorteos_publico on storage.objects;
create policy storage_write_sorteos_publico on storage.objects for insert
  with check (
    bucket_id = 'veterinarias'
    and (storage.foldername(name))[2] = 'sorteos'
    and (storage.foldername(name))[3] = 'participaciones'
    and exists (
      select 1 from public.sorteos s
      where s.tenant_id = (storage.foldername(name))[1]
        and s.estado = 'activo'
    )
  );
