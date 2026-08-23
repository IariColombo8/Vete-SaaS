-- ============================================================================
-- Veterinaria-SaaS — Schema Supabase (Postgres)
-- Migración desde Firestore. Tablas vacías, sin datos.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- Idempotente: se puede correr varias veces sin romper.
--
-- Convenciones:
--   · Columnas en snake_case. La capa `lib/supabase/queries.ts` mapea a
--     camelCase para no tocar los ~61 componentes consumidores.
--   · PK = uuid. Los IDs "naturales" de Firestore (DNI, slug de mascota,
--     fecha de historia) sobreviven como columnas UNIQUE.
--   · Arrays de config (servicios, horarios, vacunas…) van en jsonb: se leen
--     y escriben como bloque, igual que en Firestore.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

do $$ begin
  create type user_role      as enum ('superadmin', 'veterinario', 'empleado', 'usuario');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tenant_plan    as enum ('basico', 'plus', 'pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tenant_status  as enum ('activo', 'pausado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type modalidad      as enum ('local', 'domicilio', 'ambos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type turno_estado   as enum ('pendiente', 'confirmado', 'completado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitacion_estado as enum ('pendiente', 'aceptada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_visita    as enum ('consulta', 'turno_programado', 'visita_programada');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. TENANTS  (ex veterinarias/{slug} + config/datos)
-- ============================================================================

create table if not exists public.tenants (
  slug                    text primary key,
  nombre                  text,
  plan                    tenant_plan   not null default 'basico',
  status                  tenant_status not null default 'activo',
  telefono                text,
  email                   text,
  direccion               text,
  ciudad                  text,
  slogan                  text,
  descripcion             text,
  logo                    text,
  modalidad               modalidad     not null default 'local',
  google_maps_url         text,
  min_horas_anticipacion  integer       not null default 2,
  calendar_id             text,
  onboarding_completado   boolean       not null default false,
  -- Arrays de config: se leen/escriben como bloque
  servicios               jsonb         not null default '[]'::jsonb,
  horarios                jsonb         not null default '[]'::jsonb,
  fotos_hero              jsonb         not null default '[]'::jsonb,
  fotos_hero_mobile       jsonb         not null default '[]'::jsonb,
  admin_ids               jsonb         not null default '[]'::jsonb,
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now()
);

-- ============================================================================
-- 3. TURNO_CONFIG  (ex veterinarias/{slug}/config/turno)
-- ============================================================================

create table if not exists public.turno_config (
  tenant_id      text primary key references public.tenants(slug) on delete cascade,
  mascotas       jsonb not null default '[]'::jsonb,
  servicios      jsonb not null default '[]'::jsonb,
  vacunas        jsonb not null default '{}'::jsonb,  -- { perro: [...], gato: [...] }
  profesionales  jsonb not null default '[]'::jsonb,
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- 4. USUARIOS  (ex colección usuarios — ahora espejo de auth.users)
-- ============================================================================

create table if not exists public.usuarios (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  photo_url     text,
  role          user_role not null default 'usuario',
  tenant_id     text references public.tenants(slug) on delete set null,
  created_at    timestamptz not null default now(),
  last_login    timestamptz not null default now()
);

create index if not exists usuarios_tenant_idx on public.usuarios(tenant_id);
create index if not exists usuarios_email_idx  on public.usuarios(lower(email));

-- ============================================================================
-- 5. INVITACIONES
-- ============================================================================

create table if not exists public.invitaciones (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(slug) on delete cascade,
  email       text not null,
  role        user_role not null default 'empleado',
  estado      invitacion_estado not null default 'pendiente',
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- ex invitacionId(tenantId, email): un tenant no invita 2 veces al mismo mail
  constraint invitaciones_tenant_email_uk unique (tenant_id, email),
  constraint invitaciones_role_ck check (role in ('veterinario', 'empleado'))
);

create index if not exists invitaciones_email_idx on public.invitaciones(lower(email))
  where estado = 'pendiente';

-- ============================================================================
-- 6. CLIENTES  (ex veterinarias/{slug}/clientes — docId era el DNI)
-- ============================================================================

create table if not exists public.clientes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null references public.tenants(slug) on delete cascade,
  nombre           text not null,
  telefono         text not null default '',
  email            text not null default '',
  dni              text,
  domicilio        text,
  historial_datos  jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- El DNI era el docId en Firestore → único por tenant, pero opcional
  constraint clientes_tenant_dni_uk unique (tenant_id, dni)
);

create index if not exists clientes_tenant_idx       on public.clientes(tenant_id);
create index if not exists clientes_tenant_email_idx on public.clientes(tenant_id, lower(email));
-- Paginación keyset (reemplaza el cursor de Firestore)
create index if not exists clientes_keyset_idx       on public.clientes(tenant_id, nombre, id);

-- ============================================================================
-- 7. MASCOTAS  (ex .../clientes/{dni}/mascotas — docId era "nombre-tipo")
-- ============================================================================

create table if not exists public.mascotas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null references public.tenants(slug) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  nombre         text not null,
  tipo           text not null,
  edad           text,
  raza           text,
  peso           text,
  -- Token del QR de libreta pública. Único global: se busca sin conocer el tenant.
  libreta_token  text unique,
  slug           text not null,  -- ex mascotaDocId(): "firulais-perro"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint mascotas_cliente_slug_uk unique (cliente_id, slug)
);

create index if not exists mascotas_cliente_idx on public.mascotas(cliente_id);
create index if not exists mascotas_tenant_idx  on public.mascotas(tenant_id);

-- ============================================================================
-- 8. HISTORIAS  (ex .../mascotas/{id}/historias — docId era la fecha)
-- ============================================================================

create table if not exists public.historias (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(slug) on delete cascade,
  mascota_id      uuid not null references public.mascotas(id) on delete cascade,
  fecha_atencion  date not null,
  motivo          text,
  diagnostico     text not null default '',
  tratamiento     text not null default '',
  observaciones   text,
  proxima_visita  date,
  archivos        jsonb not null default '[]'::jsonb,  -- URLs de Supabase Storage
  tipo_visita     tipo_visita not null default 'consulta',
  turno_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- En Firestore la fecha era el docId (1 historia por día). Acá NO se replica esa
-- restricción a propósito: permite 2 consultas el mismo día, que antes se pisaban.
create index if not exists historias_mascota_idx on public.historias(mascota_id, fecha_atencion desc);
create index if not exists historias_tenant_idx  on public.historias(tenant_id);

-- ============================================================================
-- 9. HISTORIA_CLINICA  (ex .../historiaClinica/registro — resumen consolidado)
-- ============================================================================

create table if not exists public.historia_clinica (
  mascota_id      uuid primary key references public.mascotas(id) on delete cascade,
  tenant_id       text not null references public.tenants(slug) on delete cascade,
  consultas       jsonb not null default '[]'::jsonb,
  vacunas         jsonb not null default '[]'::jsonb,
  tratamientos    jsonb not null default '[]'::jsonb,
  alergias        jsonb not null default '[]'::jsonb,
  cirugias        jsonb not null default '[]'::jsonb,
  fecha_creacion  timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================================
-- 10. TURNOS  (ex veterinarias/{slug}/turnos)
-- Se conserva la denormalización de Firestore (cliente_* / mascota_* embebidos)
-- para no reescribir turnos-management.tsx. Es redundante, pero migrar ≠ refactorizar.
-- ============================================================================

create table if not exists public.turnos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(slug) on delete cascade,
  cliente_id          uuid references public.clientes(id) on delete set null,
  mascota_id          uuid references public.mascotas(id) on delete set null,
  -- Snapshot del cliente al momento de reservar
  cliente_nombre      text not null default '',
  cliente_telefono    text not null default '',
  cliente_email       text not null default '',
  cliente_dni         text,
  cliente_domicilio   text,
  -- Snapshot de la mascota
  mascota_nombre      text not null default '',
  mascota_tipo        text not null default '',
  mascota_motivo      text,
  -- Datos del turno
  servicio            text,
  fecha               date not null,
  hora                text not null,          -- "HH:MM"
  turno_timestamp     timestamptz not null,   -- fecha+hora resuelto, para ordenar/filtrar
  duracion_min        integer not null default 60,
  profesional_id      text,
  profesional_nombre  text,
  estado              turno_estado not null default 'pendiente',
  vacunas             jsonb not null default '[]'::jsonb,
  -- Resultado de la consulta
  diagnostico         text,
  tratamiento         text,
  medicacion          text,
  observaciones       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists turnos_tenant_fecha_idx on public.turnos(tenant_id, fecha, hora);
create index if not exists turnos_tenant_ts_idx    on public.turnos(tenant_id, turno_timestamp desc);
create index if not exists turnos_cliente_idx      on public.turnos(cliente_id);
create index if not exists turnos_email_idx        on public.turnos(tenant_id, lower(cliente_email));

-- FK diferida de historias → turnos (turnos se define después)
do $$ begin
  alter table public.historias
    add constraint historias_turno_fk
    foreign key (turno_id) references public.turnos(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 11. DIAS_BLOQUEADOS  (ex veterinarias/{slug}/diasBloqueados — docId = fecha)
-- ============================================================================

create table if not exists public.dias_bloqueados (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null references public.tenants(slug) on delete cascade,
  fecha      date not null,
  motivo     text,
  created_at timestamptz not null default now(),
  constraint dias_bloqueados_tenant_fecha_uk unique (tenant_id, fecha)
);

-- ============================================================================
-- 12. LIBRETAS_PUBLICAS  (ex veterinarias/{slug}/libretasPublicas — snapshot QR)
-- ============================================================================

create table if not exists public.libretas_publicas (
  token        text primary key,
  tenant_id    text not null references public.tenants(slug) on delete cascade,
  mascota_id   uuid references public.mascotas(id) on delete cascade,
  mascota      jsonb not null default '{}'::jsonb,
  vet_nombre   text,
  historias    jsonb not null default '[]'::jsonb,
  generado_el  timestamptz not null default now()
);

-- ============================================================================
-- 13. RECORDATORIOS_VACUNAS
-- ============================================================================

create table if not exists public.recordatorios_vacunas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(slug) on delete cascade,
  cliente_id      uuid references public.clientes(id) on delete cascade,
  mascota_id      uuid references public.mascotas(id) on delete cascade,
  mascota_nombre  text not null default '',
  telefono        text not null default '',
  vacuna          text not null,
  fecha           date not null,
  enviado         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Índice del cron de recordatorios: busca pendientes por fecha
create index if not exists recordatorios_pendientes_idx
  on public.recordatorios_vacunas(fecha)
  where enviado = false;

-- ============================================================================
-- 14. TRIGGERS
-- ============================================================================

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','turno_config','clientes','mascotas','historias',
    'historia_clinica','turnos'
  ] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- Alta automática en `usuarios` al registrarse (reemplaza createOrUpdateUser)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, email, display_name, photo_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    'usuario'
  )
  on conflict (id) do update set last_login = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 15. HELPERS DE AUTORIZACIÓN
-- SECURITY DEFINER para leer `usuarios` sin disparar RLS recursivo.
-- ============================================================================

create or replace function public.mi_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.usuarios where id = auth.uid()
$$;

create or replace function public.mi_tenant()
returns text language sql stable security definer set search_path = public as $$
  select tenant_id from public.usuarios where id = auth.uid()
$$;

-- true si el usuario actual puede administrar ese tenant
create or replace function public.es_staff(t text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and (u.role = 'superadmin'
           or (u.role in ('veterinario','empleado') and u.tenant_id = t))
  )
$$;

create or replace function public.es_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and role = 'superadmin')
$$;

-- ============================================================================
-- 16. ROW LEVEL SECURITY
-- ============================================================================

alter table public.tenants               enable row level security;
alter table public.turno_config          enable row level security;
alter table public.usuarios              enable row level security;
alter table public.invitaciones          enable row level security;
alter table public.clientes              enable row level security;
alter table public.mascotas              enable row level security;
alter table public.historias             enable row level security;
alter table public.historia_clinica      enable row level security;
alter table public.turnos                enable row level security;
alter table public.dias_bloqueados       enable row level security;
alter table public.libretas_publicas     enable row level security;
alter table public.recordatorios_vacunas enable row level security;

-- ── tenants: la página pública /[slug] los lee sin login ──
drop policy if exists tenants_read   on public.tenants;
drop policy if exists tenants_write  on public.tenants;
create policy tenants_read  on public.tenants for select using (true);
create policy tenants_write on public.tenants for all
  using (es_staff(slug)) with check (es_staff(slug));

-- ── turno_config: público lee (formulario de reserva), staff escribe ──
drop policy if exists turno_config_read  on public.turno_config;
drop policy if exists turno_config_write on public.turno_config;
create policy turno_config_read  on public.turno_config for select using (true);
create policy turno_config_write on public.turno_config for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ── usuarios: cada uno ve/edita lo suyo; superadmin ve todo ──
drop policy if exists usuarios_self_read   on public.usuarios;
drop policy if exists usuarios_self_update on public.usuarios;
drop policy if exists usuarios_admin_all   on public.usuarios;
create policy usuarios_self_read   on public.usuarios for select using (id = auth.uid());
create policy usuarios_self_update on public.usuarios for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy usuarios_admin_all   on public.usuarios for all
  using (es_superadmin()) with check (es_superadmin());

-- ── invitaciones: el invitado ve la suya, el staff del tenant las gestiona ──
drop policy if exists invitaciones_own    on public.invitaciones;
drop policy if exists invitaciones_manage on public.invitaciones;
create policy invitaciones_own on public.invitaciones for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));
create policy invitaciones_manage on public.invitaciones for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ── clientes: staff del tenant, o el propio cliente por su email ──
drop policy if exists clientes_staff on public.clientes;
drop policy if exists clientes_self  on public.clientes;
create policy clientes_staff on public.clientes for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));
create policy clientes_self on public.clientes for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- ── mascotas / historias / historia_clinica: staff, o dueño de la mascota ──
drop policy if exists mascotas_staff on public.mascotas;
drop policy if exists mascotas_self  on public.mascotas;
create policy mascotas_staff on public.mascotas for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));
create policy mascotas_self on public.mascotas for select
  using (exists (
    select 1 from public.clientes c
    where c.id = mascotas.cliente_id
      and lower(c.email) = lower(auth.jwt() ->> 'email')
  ));

drop policy if exists historias_staff on public.historias;
drop policy if exists historias_self  on public.historias;
create policy historias_staff on public.historias for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));
create policy historias_self on public.historias for select
  using (exists (
    select 1 from public.mascotas m
    join public.clientes c on c.id = m.cliente_id
    where m.id = historias.mascota_id
      and lower(c.email) = lower(auth.jwt() ->> 'email')
  ));

drop policy if exists historia_clinica_staff on public.historia_clinica;
create policy historia_clinica_staff on public.historia_clinica for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ── turnos: cualquiera puede RESERVAR (formulario público), staff gestiona ──
drop policy if exists turnos_staff  on public.turnos;
drop policy if exists turnos_insert on public.turnos;
drop policy if exists turnos_self   on public.turnos;
create policy turnos_staff on public.turnos for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));
-- El público reserva, pero solo puede crear turnos 'pendiente'
create policy turnos_insert on public.turnos for insert
  with check (estado = 'pendiente');
-- El cliente ve sus propios turnos (/mis-turnos)
create policy turnos_self on public.turnos for select
  using (lower(cliente_email) = lower(auth.jwt() ->> 'email'));

-- ── dias_bloqueados: público lee (calcular disponibilidad), staff escribe ──
drop policy if exists dias_read  on public.dias_bloqueados;
drop policy if exists dias_write on public.dias_bloqueados;
create policy dias_read  on public.dias_bloqueados for select using (true);
create policy dias_write on public.dias_bloqueados for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ── libretas_publicas: el QR se abre sin login; el token es el secreto ──
drop policy if exists libretas_read  on public.libretas_publicas;
drop policy if exists libretas_write on public.libretas_publicas;
create policy libretas_read  on public.libretas_publicas for select using (true);
create policy libretas_write on public.libretas_publicas for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ── recordatorios_vacunas: solo staff (el cron usa la service_role key) ──
drop policy if exists recordatorios_staff on public.recordatorios_vacunas;
create policy recordatorios_staff on public.recordatorios_vacunas for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ============================================================================
-- 17. REALTIME  (reemplaza onSnapshot de Firestore)
-- ============================================================================

do $$ begin
  alter publication supabase_realtime add table public.turnos;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.dias_bloqueados;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 18. STORAGE  (reemplaza Firebase Storage)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('veterinarias', 'veterinarias', true)
on conflict (id) do nothing;

drop policy if exists storage_read   on storage.objects;
drop policy if exists storage_write  on storage.objects;
drop policy if exists storage_delete on storage.objects;

-- Lectura pública: fotos del hero, logos y archivos de historias
create policy storage_read on storage.objects for select
  using (bucket_id = 'veterinarias');

-- Escritura: solo staff del tenant. Path = veterinarias/{tenantId}/...
create policy storage_write on storage.objects for insert
  with check (bucket_id = 'veterinarias' and es_staff((storage.foldername(name))[1]));

create policy storage_delete on storage.objects for delete
  using (bucket_id = 'veterinarias' and es_staff((storage.foldername(name))[1]));

-- ============================================================================
-- FIN
-- ============================================================================
