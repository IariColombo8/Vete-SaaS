-- veterinariaprueba0@gmail.com deja de ser empleado de "vipvet" y pasa a ser
-- dueño de su propia veterinaria: "Mundo Animal" (slug: mundo-animal).

-- 1. Alta del tenant (bypassa crear_veterinaria: se ejecuta como superadmin
--    en el SQL Editor, no como el usuario dueño, así que no hay auth.uid()).
insert into public.tenants (
  slug, nombre, plan, status,
  telefono, direccion, modalidad, google_maps_url, admin_ids
) values (
  'mundo-animal',
  'Mundo Animal',
  'pro',
  'activo',
  '03456415578',
  'Las Camelias 602, Federación, Entre Ríos',
  'local',
  '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3420.389209868534!2d-57.91948102349215!3d-30.98752287565206!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95ada38a04e8df07%3A0xe047c6fa5080bdc5!2sMundo%20Animal!5e0!3m2!1ses!2sar!4v1787681709598!5m2!1ses!2sar" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>',
  (select coalesce(jsonb_agg(id::text), '[]'::jsonb) from public.usuarios where lower(email) = 'veterinariaprueba0@gmail.com')
)
on conflict (slug) do nothing;

insert into public.turno_config (tenant_id) values ('mundo-animal')
on conflict (tenant_id) do nothing;

-- 2. El usuario deja de ser empleado de vipvet y pasa a dueño de mundo-animal
update public.usuarios
set role = 'veterinario',
    tenant_id = 'mundo-animal'
where lower(email) = 'veterinariaprueba0@gmail.com';

-- Verificación
select id, email, display_name, role, tenant_id
from public.usuarios
where lower(email) = 'veterinariaprueba0@gmail.com';

select slug, nombre, plan, status, telefono, direccion, modalidad
from public.tenants
where slug = 'mundo-animal';
