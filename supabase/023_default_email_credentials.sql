-- Tenant "default": cuenta de Google (Gmail + Calendar) compartida por VetPanel,
-- usada como fallback para cualquier tenant que no conectó su propia cuenta y
-- no usa EmailJS. No es una veterinaria real: no tiene admins ni aparece en
-- listados públicos, solo existe para satisfacer el FK de
-- tenant_email_credentials.tenant_id -> tenants(slug).
--
-- El client_id/client_secret/refresh_token de esta fila NO se cargan acá
-- (evitar secretos en migraciones versionadas). Se insertan por script server-side
-- una sola vez con SUPABASE_SECRET_KEY.

insert into public.tenants (slug, nombre, status)
values ('default', 'VetPanel (cuenta compartida)', 'activo')
on conflict (slug) do nothing;
