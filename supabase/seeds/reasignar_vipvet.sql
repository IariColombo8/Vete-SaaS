-- ServiTec (informaticabalbin@gmail.com) sigue siendo superadmin,
-- pero deja de estar asociado como dueño de "vipvet".
-- El tenant "vipvet" pasa a pertenecer a vipvetcdelu@gmail.com (VipVet).

-- 1. Nuevo dueño: rol veterinario + tenant_id = vipvet
update public.usuarios
set role = 'veterinario',
    tenant_id = 'vipvet'
where id = '5bd1fc56-da98-4dba-a90d-119ec223fd36'; -- vipvetcdelu@gmail.com

-- 2. ServiTec deja de tener tenant_id asociado, pero conserva superadmin
update public.usuarios
set tenant_id = null
where id = '0ac216d5-589a-4410-83f2-3ef89eeb0106'; -- informaticabalbin@gmail.com

-- Verificación
select id, email, display_name, role, tenant_id
from public.usuarios
where id in (
  '0ac216d5-589a-4410-83f2-3ef89eeb0106',
  '5bd1fc56-da98-4dba-a90d-119ec223fd36'
);
