-- ============================================================================
-- 015. Publicación de productos en la landing pública del tenant.
--
-- Campo manual, independiente de `activo` y del stock: el vet decide qué
-- mostrar en su vidriera pública, no es automático. Default false para no
-- exponer de golpe todo el catálogo ya cargado de los tenants existentes.
-- ============================================================================

alter table public.productos
  add column if not exists publicado_en_landing boolean not null default false;

create index if not exists productos_publicados_idx
  on public.productos (tenant_id)
  where publicado_en_landing;
