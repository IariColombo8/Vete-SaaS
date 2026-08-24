-- Búsqueda de productos insensible a acentos ("arnes" tiene que encontrar "Arnés").
-- `unaccent()` no es IMMUTABLE (depende del diccionario de texto activo), así que
-- una columna generada necesita un wrapper marcado IMMUTABLE a mano.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

create or replace function public.unaccent_immutable(text)
returns text
language sql
immutable
parallel safe
as $$
  select public.unaccent('public.unaccent', $1)
$$;

alter table public.productos
  add column if not exists busqueda_normalizada text generated always as (
    public.unaccent_immutable(
      lower(coalesce(nombre, '') || ' ' || coalesce(marca, '') || ' ' ||
            coalesce(linea, '') || ' ' || coalesce(codigo, '') || ' ' ||
            coalesce(codigo_barras, ''))
    )
  ) stored;

create index if not exists productos_busqueda_normalizada_idx
  on public.productos using gin (busqueda_normalizada gin_trgm_ops);
