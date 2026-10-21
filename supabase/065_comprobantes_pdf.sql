-- ============================================================================
-- 065 · PDF de factura guardado (una sola vez, nunca se regenera)
-- ============================================================================
-- Hasta ahora el PDF de la factura se dibujaba de nuevo en cada descarga, así
-- que un cambio de logo, de domicilio o del propio generador cambiaba una
-- factura ya emitida. Ahora el primer PDF se sube a Storage y es el que se
-- descarga y se manda siempre.
--
-- Bucket privado `comprobantes`, path `{tenant_id}/{comprobante_id}.pdf`.
-- Policies de select e insert para el staff del tenant; sin update ni delete:
-- un PDF subido no se puede pisar ni borrar desde el navegador.

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists comprobantes_pdf_read  on storage.objects;
drop policy if exists comprobantes_pdf_write on storage.objects;

create policy comprobantes_pdf_read on storage.objects for select
  using (bucket_id = 'comprobantes' and public.es_staff((storage.foldername(name))[1]));

create policy comprobantes_pdf_write on storage.objects for insert
  with check (bucket_id = 'comprobantes' and public.es_staff((storage.foldername(name))[1]));

-- ----------------------------------------------------------------------------
-- facturacion_estado: suma los datos del emisor que van impresos en la factura
-- (domicilio fiscal, IIBB, inicio de actividades). Siguen sin salir secretos.
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
          'domicilio_fiscal', f.domicilio_fiscal,
          'ingresos_brutos', f.ingresos_brutos,
          'inicio_actividades', f.inicio_actividades,
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
