-- ============================================================================
-- 027. Reconocimiento de cliente entre veterinarias, solo al registrarse.
--
-- Cada tenant sigue teniendo su propia fila en `clientes` y su propio
-- historial clínico — el aislamiento por tenant_id no cambia. Lo único que se
-- agrega es una consulta pública por DNI que ignora tenant_id, para poder
-- decir "ya tenemos tus datos" y autocompletar nombre/teléfono/email/
-- domicilio + sus mascotas (solo nombre/tipo/raza, sin historia clínica) la
-- primera vez que alguien se registra en una veterinaria nueva. Se dispara
-- únicamente cuando la persona escribe su DNI en el formulario de alta — no
-- hay ningún proceso de fondo ni auto-registro en otros tenants.
-- ============================================================================

create or replace function public.buscar_cliente_global_publico(p_dni text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_mascotas jsonb;
begin
  if p_dni is null or trim(p_dni) = '' then
    return null;
  end if;

  select * into v_cliente from public.clientes
    where dni = trim(p_dni)
    order by updated_at desc nulls last, created_at desc
    limit 1;

  if v_cliente.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', m.nombre, 'tipo', m.tipo, 'raza', m.raza
  )), '[]'::jsonb) into v_mascotas
  from public.mascotas m
  where m.cliente_id = v_cliente.id;

  return jsonb_build_object(
    'nombre', v_cliente.nombre,
    'telefono', v_cliente.telefono,
    'email', v_cliente.email,
    'domicilio', v_cliente.domicilio,
    'mascotas', v_mascotas
  );
end $$;

grant execute on function public.buscar_cliente_global_publico(text) to anon, authenticated;
