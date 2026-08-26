-- Edad estructurada de la mascota: numero + unidad + fecha en que se cargo ese
-- valor. Permite recalcular la edad actual sumando el tiempo transcurrido
-- desde esa fecha, en vez de depender de un texto libre ("2 años") que queda
-- desactualizado turno tras turno.
--
-- La columna `edad` (texto) se mantiene para no romper lecturas viejas (PDF,
-- libreta) que todavia esperan un string; se sigue actualizando en paralelo
-- desde la aplicacion con el valor formateado.

alter table public.mascotas
  add column if not exists edad_valor numeric,
  add column if not exists edad_unidad text check (edad_unidad in ('meses', 'anios')),
  add column if not exists edad_registrada_en date;
