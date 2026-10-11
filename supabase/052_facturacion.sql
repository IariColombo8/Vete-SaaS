-- ============================================================================
-- 052 — Factura electrónica ARCA (ex AFIP), directo contra WSAA + WSFEv1
--
-- Cada veterinaria factura con SU CUIT y SU certificado. El flujo:
--   1. Carga datos fiscales (CUIT, razón social, condición IVA, punto de venta).
--   2. VetPanel genera la clave privada y el CSR; la veterinaria sube el CSR a
--      ARCA (Administración de Certificados Digitales), baja el .crt y lo pega.
--      Además tiene que autorizar el servicio `wsfe` para ese certificado.
--   3. "Probar conexión" pide un ticket de acceso (WSAA) y llama a FEDummy.
--   4. Desde el mostrador / historial, "Facturar" emite el comprobante de una
--      venta: el servidor pide el CAE y guarda todo en `comprobantes`.
--
-- 1. `tenant_fiscal`: datos fiscales + certificado + clave privada CIFRADA
--    (AES-256-GCM con FACTURACION_ENCRYPTION_KEY) + cache del ticket de acceso
--    (dura 12 h). RLS encendida y SIN policies: solo service_role.
-- 2. `comprobantes`: una fila por comprobante pedido a ARCA (emitido o
--    rechazado), con snapshot completo para regenerar el PDF. Única por
--    (tenant, tipo, punto de venta, número) entre los emitidos.
-- 3. `facturacion_estado(p_tenant)`: lo que el cliente puede saber sin ver
--    secretos (¿configurado?, ¿certificado cargado?, ambiente, punto de venta).
-- 4. Alícuota de IVA por producto y condición fiscal del cliente, para
--    discriminar IVA en facturas A y elegir la letra.
--
-- Idempotente. Requiere `005_ventas.sql`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tenant_fiscal
-- ----------------------------------------------------------------------------
create table if not exists public.tenant_fiscal (
  tenant_id            text primary key references public.tenants(slug) on delete cascade,
  cuit                 text not null,
  razon_social         text not null,
  domicilio_fiscal     text,
  condicion_iva        text not null default 'MONOTRIBUTO'
                       check (condicion_iva in ('RI', 'MONOTRIBUTO', 'EXENTO')),
  inicio_actividades   date,
  ingresos_brutos      text,
  punto_venta          integer not null default 1 check (punto_venta between 1 and 99999),
  ambiente             text not null default 'homologacion'
                       check (ambiente in ('homologacion', 'produccion')),
  -- Certificado
  key_pem_enc          text,            -- clave privada cifrada (nunca en claro)
  csr_pem              text,            -- pedido de certificado para subir a ARCA
  cert_pem             text,            -- certificado firmado por ARCA
  cert_vence_at        timestamptz,
  -- Ticket de acceso (WSAA) cacheado: dura 12 h
  ta_token             text,
  ta_sign              text,
  ta_expira_at         timestamptz,
  -- Última prueba de conexión
  ultima_prueba_at     timestamptz,
  ultima_prueba_ok     boolean,
  ultima_prueba_detalle text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.tenant_fiscal enable row level security;
-- Sin policies a propósito: ni select ni update desde el cliente.

-- ----------------------------------------------------------------------------
-- 2. comprobantes
-- ----------------------------------------------------------------------------
create table if not exists public.comprobantes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             text not null references public.tenants(slug) on delete cascade,
  venta_id              uuid references public.ventas(id) on delete set null,
  -- Código ARCA: 1 Factura A, 6 Factura B, 11 Factura C, 3 NC A, 8 NC B, 13 NC C
  tipo_cbte             integer not null,
  punto_venta           integer not null,
  numero                bigint,
  cae                   text,
  cae_vto               date,
  fecha                 date not null default current_date,
  concepto              integer not null default 1,
  ambiente              text not null,
  -- Receptor (snapshot)
  doc_tipo              integer not null,   -- 80 CUIT, 96 DNI, 99 consumidor final
  doc_nro               text not null default '0',
  receptor_nombre       text not null default '',
  receptor_domicilio    text not null default '',
  receptor_condicion_iva integer not null, -- código ARCA (1 RI, 4 exento, 5 CF, 6 monotributo…)
  -- Importes
  imp_total             numeric(14,2) not null,
  imp_neto              numeric(14,2) not null default 0,
  imp_iva               numeric(14,2) not null default 0,
  imp_op_ex             numeric(14,2) not null default 0,
  imp_tot_conc          numeric(14,2) not null default 0,
  imp_trib              numeric(14,2) not null default 0,
  alicuotas             jsonb not null default '[]'::jsonb, -- [{id, base, importe}]
  items                 jsonb not null default '[]'::jsonb, -- snapshot para el PDF
  -- Nota de crédito: a qué comprobante anula
  comprobante_asociado_id uuid references public.comprobantes(id) on delete set null,
  -- Resultado
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente', 'emitido', 'rechazado')),
  observaciones         jsonb not null default '[]'::jsonb, -- [{code, msg}] de ARCA
  respuesta_raw         jsonb,
  creado_por            uuid references public.usuarios(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists comprobantes_numero_uk
  on public.comprobantes (tenant_id, tipo_cbte, punto_venta, numero)
  where estado = 'emitido';

-- Una venta tiene a lo sumo una factura emitida (las notas de crédito van aparte).
create unique index if not exists comprobantes_venta_factura_uk
  on public.comprobantes (venta_id)
  where estado = 'emitido' and tipo_cbte in (1, 6, 11);

create index if not exists comprobantes_tenant_idx on public.comprobantes (tenant_id, created_at desc);

alter table public.comprobantes enable row level security;

drop policy if exists comprobantes_read on public.comprobantes;
create policy comprobantes_read on public.comprobantes
  for select using (public.es_staff(tenant_id));
-- Se escriben desde el servidor (service_role).

-- ----------------------------------------------------------------------------
-- 3. facturacion_estado: lo visible sin secretos
-- ----------------------------------------------------------------------------
create or replace function public.facturacion_estado(p_tenant text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.es_staff(p_tenant) then jsonb_build_object('configurado', false)
    else coalesce(
      (select jsonb_build_object(
          'configurado', true,
          'listo', (f.cert_pem is not null and f.key_pem_enc is not null),
          'ambiente', f.ambiente,
          'cuit', f.cuit,
          'razon_social', f.razon_social,
          'condicion_iva', f.condicion_iva,
          'punto_venta', f.punto_venta,
          'cert_vence_at', f.cert_vence_at,
          'ultima_prueba_ok', f.ultima_prueba_ok
        )
        from public.tenant_fiscal f
       where f.tenant_id = p_tenant),
      jsonb_build_object('configurado', false)
    )
  end
$$;

grant execute on function public.facturacion_estado(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. IVA por producto y condición fiscal del cliente
-- ----------------------------------------------------------------------------
-- 21 por defecto. Alimento balanceado y medicamentos veterinarios pueden tener
-- otra alícuota según el caso: lo define el contador de cada veterinaria.
alter table public.productos add column if not exists alicuota_iva numeric(5,2) not null default 21
  check (alicuota_iva in (0, 2.5, 5, 10.5, 21, 27));

alter table public.clientes add column if not exists cuit text;
alter table public.clientes add column if not exists condicion_iva text not null default 'CF'
  check (condicion_iva in ('CF', 'RI', 'MONOTRIBUTO', 'EXENTO', 'NO_CATEGORIZADO'));
