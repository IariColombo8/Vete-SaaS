-- Tercer proveedor de email por tenant: EmailJS (cuenta propia del tenant).
--
-- Igual que Gmail: las credenciales van en `tenant_email_credentials`, sin
-- policies para anon/authenticated (ver 007_email_gmail.sql). El envío usa la
-- Private Key de EmailJS como access_token para poder llamar a la API desde el
-- servidor (sin eso, EmailJS rechaza requests que no vengan del origin
-- configurado en el dashboard).

-- El nombre del constraint original puede no ser el que asigna la convención
-- por defecto (según cómo se haya creado la columna), así que se busca por
-- catálogo en vez de asumir "tenants_email_provider_check".
do $$
declare
  v_nombre text;
begin
  select conname into v_nombre
  from pg_constraint
  where conrelid = 'public.tenants'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%email_provider%';

  if v_nombre is not null then
    execute format('alter table public.tenants drop constraint %I', v_nombre);
  end if;
end $$;

alter table tenants
  add constraint tenants_email_provider_check
    check (email_provider in ('resend', 'gmail', 'emailjs'));

alter table tenant_email_credentials
  add column if not exists emailjs_service_id  text,
  add column if not exists emailjs_template_id text,
  add column if not exists emailjs_public_key  text,
  add column if not exists emailjs_private_key text;
