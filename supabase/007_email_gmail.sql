-- Email por tenant: Resend (global, vía env vars) o Gmail API (credenciales OAuth propias del tenant).
--
-- `tenants.email_provider` es pública (como `calendar_id`): el dueño la
-- cambia desde Configuración y las policies existentes de `tenants` ya la
-- cubren.
--
-- Las credenciales de Gmail (client_secret, refresh_token) van en una tabla
-- aparte, SIN policies de select/insert/update para anon/authenticated. Con
-- RLS habilitada y sin policies, solo el service_role (que la saltea) puede
-- leer o escribir: nunca llegan al bundle del navegador ni a la respuesta de
-- `getTenantConfig` (que hace `select("*")` sobre `tenants` con la key
-- pública). Todo acceso pasa por rutas server-side con `getAdminDb()`.

alter table tenants
  add column if not exists email_provider text not null default 'resend'
    check (email_provider in ('resend', 'gmail'));

create table if not exists tenant_email_credentials (
  tenant_id text primary key references tenants(slug) on delete cascade,
  gmail_client_id text,
  gmail_client_secret text,
  gmail_refresh_token text,
  gmail_sender_email text,
  updated_at timestamptz not null default now()
);

alter table tenant_email_credentials enable row level security;
-- Sin policies a propósito: solo service_role accede (ver comentario arriba).
