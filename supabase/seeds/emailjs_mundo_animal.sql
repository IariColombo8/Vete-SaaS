-- Configura EmailJS como proveedor de email de "mundo-animal" con las
-- credenciales de su cuenta (Service ID, Template ID, Public/Private Key).
-- Ejecutar DESPUÉS de 010_email_emailjs.sql.

update public.tenants
set email_provider = 'emailjs'
where slug = 'mundo-animal';

insert into public.tenant_email_credentials (
  tenant_id, emailjs_service_id, emailjs_template_id, emailjs_public_key, emailjs_private_key
) values (
  'mundo-animal',
  'VeterinariaPrueba001',
  'PlantillaVetPrueba001',
  'CW0pC6LjiHso8ro6G',
  '3CyC1J4uQ02II2Kxv56P6'
)
on conflict (tenant_id) do update set
  emailjs_service_id  = excluded.emailjs_service_id,
  emailjs_template_id = excluded.emailjs_template_id,
  emailjs_public_key  = excluded.emailjs_public_key,
  emailjs_private_key = excluded.emailjs_private_key,
  updated_at = now();

-- Verificación
select slug, email_provider from public.tenants where slug = 'mundo-animal';
select tenant_id, emailjs_service_id, emailjs_template_id, emailjs_public_key
from public.tenant_email_credentials where tenant_id = 'mundo-animal';
