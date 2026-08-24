-- ============================================================================
-- VipVet — borrar las imágenes de los productos
--
-- Las imágenes que cargó `vipvet_alimentos_imagenes.sql` eran placeholders de
-- picsum.photos: fotos al azar que no tienen nada que ver con una veterinaria.
-- Esto las saca y deja la grilla con el icono de caja, que es más honesto que
-- una foto de un paisaje al lado de una bolsa de alimento.
--
-- Solo borra los placeholders de picsum: si cargaste una foto real a mano o
-- subiste algo a Supabase Storage, se respeta.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

update public.productos
   set imagen_url = null
 where tenant_id = 'vipvet'
   and imagen_url like 'https://picsum.photos/%';

-- Verificación: tiene que dar 0.
select count(*) as quedan_placeholders
  from public.productos
 where tenant_id = 'vipvet'
   and imagen_url like 'https://picsum.photos/%';

-- ============================================================================
-- Si querés borrar TODAS las imágenes, no solo los placeholders, usá esto:
-- ============================================================================

-- update public.productos set imagen_url = null where tenant_id = 'vipvet';
