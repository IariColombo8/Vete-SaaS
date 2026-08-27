-- ============================================================================
-- 022. Foto de la promoción, cantidades fraccionarias y vidriera pública.
--
-- Una promoción puede incluir un producto que se vende por kilo (alimento
-- suelto, `unidad = 'kg'`): la cantidad ya no puede ser un entero fijo, tiene
-- que aceptar "0.5 kg". `promocion_items.cantidad` pasa de integer a numeric.
--
-- Además se agrega una policy de lectura pública para que la landing del
-- tenant (sin sesión) pueda mostrar las promociones activas, igual que ya
-- pasa con `productos.publicado_en_landing`. Antes solo existía
-- `promociones_staff`, que bloquea cualquier lectura anónima.
-- ============================================================================

alter table public.promociones
  add column if not exists foto_url text;

alter table public.promocion_items
  drop constraint if exists promocion_items_cantidad_check;

alter table public.promocion_items
  alter column cantidad type numeric(10,3) using cantidad::numeric(10,3);

alter table public.promocion_items
  add constraint promocion_items_cantidad_check check (cantidad > 0);

drop policy if exists promociones_publico on public.promociones;
create policy promociones_publico on public.promociones for select
  using (activa = true);

drop policy if exists promocion_items_publico on public.promocion_items;
create policy promocion_items_publico on public.promocion_items for select
  using (
    exists (
      select 1 from public.promociones pr
      where pr.id = promocion_id and pr.activa = true
    )
  );
