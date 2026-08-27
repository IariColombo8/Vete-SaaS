# Historia clínica pública por DNI + perfil de mascota

## Contexto

El landing público de cada veterinaria (`app/[slug]/vet-public-view.tsx`) tiene
dos CTAs: "Sacar turno" y "Registrarme como cliente" (`RegistroClienteDialog`).
Se agrega un tercero: un visitante que ya es cliente puede buscar su DNI y ver
la historia clínica y los turnos (pasados y futuros) de sus mascotas, sin
necesitar login. Además, puede subirle una foto opcional a cada mascota, que
se usa como fondo del perfil.

Todo el acceso público hoy pasa por funciones `security definer` en Postgres
(ver `supabase/020_clientes_publico.sql`) porque las RLS policies de
`clientes`, `mascotas`, `historias`, `historia_clinica` y `turnos` solo dejan
pasar a `es_staff(tenant_id)` o al dueño autenticado (`auth.jwt() ->> 'email'`
matching). Un visitante anónimo buscando por DNI no es ninguna de las dos
cosas, así que hacen falta RPCs nuevas para `historias` y `turnos`, siguiendo
el mismo patrón.

La subida de foto tiene un problema aparte: la policy de storage
(`storage_write` en `schema.sql`) solo permite `insert` a `es_staff(tenant_id)`.
Subir sin sesión requiere un endpoint server-side que valide ownership (DNI →
mascota) antes de escribir con la service role key.

## Alcance

Dentro:
- Botón nuevo en el landing.
- Página de búsqueda por DNI (`/[slug]/mi-historia`).
- Página de perfil de mascota (`/[slug]/mi-historia/[mascotaId]`) con historia
  clínica, turnos y foto opcional.
- RPCs nuevas para exponer `historias`, `turnos` y una mascota puntual sin
  sesión.
- Endpoint server-side para subir la foto con validación de ownership.

Fuera:
- Cualquier edición de datos del cliente/mascota desde esta página (ya existe
  vía `RegistroClienteDialog` y el flujo de reserva de turno).
- Persistir el DNI ingresado (sesión, localStorage, cookie). Cada visita a
  `/mi-historia` vuelve a pedir el DNI.
- Cambiar el comportamiento de `/mis-turnos` (ese flujo sigue siendo el de
  usuario autenticado por email).

## Arquitectura

### Rutas nuevas

```
app/[slug]/mi-historia/page.tsx              → buscador por DNI (client component)
app/[slug]/mi-historia/[mascotaId]/page.tsx  → perfil de la mascota (client component)
app/api/mascota-foto/route.ts                → POST, sube la foto con ownership check
```

### Flujo de búsqueda (`/mi-historia`)

1. Input de DNI + botón "Buscar".
2. `getClienteByDNI(slug, dni)` (ya existe, vía RPC `buscar_cliente_publico`).
3. Sin resultado → tarjeta con mensaje "No encontramos datos con ese DNI" +
   botones "Sacar turno" (`/${slug}/turno`) y el propio
   `RegistroClienteDialog` reutilizado.
4. Con resultado → `obtener_mascotas_publico(tenant, clienteId)` (ya existe) y
   se listan como tarjetas: foto (si tiene `fotoUrl`) o placeholder por tipo de
   animal, nombre, tipo/raza. Cada tarjeta linkea a
   `/${slug}/mi-historia/${mascota.id}`.
5. Si el cliente no tiene mascotas: mensaje "Todavía no cargaste mascotas" (no
   es un error, es un estado válido — mismo tono que el resto del copy del
   proyecto).

El DNI vive solo en el estado del componente de esta página. Si el usuario
entra directo a la URL de un perfil sin haber buscado antes, la página de
perfil igual funciona (ver abajo): no depende de haber pasado por el buscador
en la misma sesión de navegación.

### Flujo del perfil (`/mi-historia/[mascotaId]`)

1. `obtener_mascota_publico(tenant, mascotaId)` → datos de la mascota
   (incluye `fotoUrl`). Si no existe o no pertenece al tenant → página de
   "mascota no encontrada" con link de vuelta a `/mi-historia`.
2. En paralelo: `getHistoriasPublico(tenant, mascotaId)` y
   `getTurnosPublicoPorMascota(tenant, mascotaId)` (ver más abajo cómo se
   resuelve el cliente dueño para traer los turnos).
3. Render:
   - **Banner**: `fotoUrl` como `background-image` (cover) con gradiente
     oscuro inferior; encima, nombre grande + tipo/raza. Sin foto: gradiente
     decorativo (color derivado del tipo de animal) + emoji grande, mismo
     criterio visual que ya usa `MASCOTAS_DEFAULT` en `lib/turno-defaults.ts`
     para emoji/nombre por tipo.
   - Botón "Cambiar foto" (ícono cámara) flotando sobre el banner, abre un
     `<input type="file" accept="image/*">` oculto. Al elegir archivo, pide el
     DNI de nuevo en un mini-diálogo (para el ownership check del endpoint) y
     hace `POST /api/mascota-foto`.
   - Sección **Historia clínica**: timeline de `Historia[]`, orden
     descendente por `fechaAtencion` (mismo orden que ya trae la RPC).
     Cada item: fecha, motivo, diagnóstico, tratamiento, observaciones si hay.
     Filtra `tipoVisita !== "turno_programado"` (igual criterio que
     `contarVisitasMascota`), para no duplicar contra la sección de turnos.
   - Sección **Turnos**: lista de `Turno[]` de esa mascota, ordenados por
     fecha descendente, con chip de color por `estado`
     (pendiente/confirmado/completado/cancelado — mismos colores que ya usa
     el admin de turnos).
   - Estados vacíos separados para cada sección ("Todavía no hay historia
     clínica cargada" / "Todavía no sacó turnos").

### Cómo se resuelven los turnos de una mascota sin tener el clienteId a mano

La RPC nueva es `obtener_turnos_publico(p_tenant, p_cliente_id)` (turnos de
**un cliente**, como pide el resto del patrón `_publico`). La página de
perfil solo tiene el `mascotaId` en la URL, así que:

- `obtener_mascota_publico` devuelve también `cliente_id` (columna que ya
  existe en `mascotas`).
- La página llama `obtener_turnos_publico(tenant, mascota.clienteId)` y
  filtra en el cliente por `turno.mascotaId === mascotaId` (los turnos viejos
  sin `mascotaId` seteado no aparecen acá — mismo comportamiento que ya tiene
  el resto del código con turnos legacy sin ese campo).

Esto evita crear una tercera RPC filtrando por mascota directamente en SQL;
el volumen de turnos por cliente es chico y el filtro en cliente es trivial.

## Backend

### `supabase/021_historia_publica.sql`

Nueva migración, mismo estilo que `020_clientes_publico.sql`
(`security definer`, `set search_path = public`, `grant execute ... to anon,
authenticated`, todas validan `tenant_id` para no filtrar datos de otro
tenant).

```sql
-- Historias de una mascota (valida que la mascota sea del tenant)
create or replace function public.obtener_historias_publico(
  p_tenant text,
  p_mascota_id uuid
) returns setof public.historias
language sql stable security definer set search_path = public
as $$
  select h.* from public.historias h
  join public.mascotas m on m.id = h.mascota_id
  where m.tenant_id = p_tenant and h.mascota_id = p_mascota_id
  order by h.fecha_atencion desc
$$;

-- Turnos de un cliente (valida que el cliente sea del tenant)
create or replace function public.obtener_turnos_publico(
  p_tenant text,
  p_cliente_id uuid
) returns setof public.turnos
language sql stable security definer set search_path = public
as $$
  select t.* from public.turnos t
  where t.tenant_id = p_tenant and t.cliente_id = p_cliente_id
  order by t.fecha desc, t.hora desc
$$;

-- Una mascota puntual (para /mi-historia/[mascotaId])
create or replace function public.obtener_mascota_publico(
  p_tenant text,
  p_mascota_id uuid
) returns public.mascotas
language sql stable security definer set search_path = public
as $$
  select * from public.mascotas
  where tenant_id = p_tenant and id = p_mascota_id
$$;

grant execute on function public.obtener_historias_publico(text, uuid) to anon, authenticated;
grant execute on function public.obtener_turnos_publico(text, uuid) to anon, authenticated;
grant execute on function public.obtener_mascota_publico(text, uuid) to anon, authenticated;

alter table public.mascotas add column if not exists foto_url text;
```

### `lib/supabase/mascotas.ts` — funciones nuevas

- `getMascotaPublico(tenantId, mascotaId): Promise<Mascota | null>` — vía RPC
  `obtener_mascota_publico`, mapea igual que el resto de `aMascota` (agregar
  `fotoUrl` al mapeo y al tipo `Mascota` en `types.ts`).
- No hace falta una función de "guardar foto" en el cliente: la sube el API
  route, no `lib/supabase` directo (ver abajo).

### `lib/supabase/historias.ts` — función nueva

- `getHistoriasPublico(tenantId, mascotaId): Promise<Historia[]>` — vía RPC
  `obtener_historias_publico`, reusa `aHistoria`.

### `lib/supabase/turnos.ts` — función nueva

- `getTurnosPublico(tenantId, clienteId): Promise<Turno[]>` — vía RPC
  `obtener_turnos_publico`, reusa `aTurno`. (Distinta de
  `getTurnosByClienteId`, que hace `select` directo y depende de RLS/sesión
  de staff.)

### `types.ts`

- `Mascota.fotoUrl?: string` — nuevo campo opcional.

### `app/api/mascota-foto/route.ts`

POST, `multipart/form-data` con campos `tenantId`, `dni`, `mascotaId`, `foto`.

1. Validar que vengan los 4 campos y que `foto` sea `image/*` y ≤ 5MB. Si no,
   400.
2. `buscar_cliente_publico(tenantId, dni)` (RPC ya existente, vía cliente
   supabase normal con anon key) → si no hay cliente, 404
   `"Cliente no encontrado"`.
3. `obtener_mascotas_publico(tenantId, cliente.id)` → si `mascotaId` no está
   en la lista, 403 `"Esa mascota no pertenece a este DNI"`.
4. Redimensionar (reusar la lógica de `redimensionarImagen` de
   `lib/supabase/storage.ts`, extraída a una función compartida que no
   dependa del DOM del browser — en server usa la misma idea pero con
   `sharp` si ya está en dependencias, o si no, sube tal cual y deja la
   compresión para el momento en que el staff suba fotos administrativas.
   **Decisión: no redimensionar en el server para esta primera versión** —
   validar tamaño máximo (5MB) alcanza; evita agregar una dependencia nueva
   solo para esto).
5. Subir con `createClient(url, SERVICE_ROLE_KEY)` (cliente Supabase aparte,
   solo en este route, nunca expuesto al browser) a
   `veterinarias/{tenantId}/mascotas/{mascotaId}/foto-{timestamp}.{ext}`.
6. `update mascotas set foto_url = <url> where id = mascotaId and tenant_id =
   tenantId` con ese mismo cliente service-role (bypassa RLS, ya validamos
   ownership a mano arriba).
7. Responder `{ fotoUrl }`.

Variable de entorno nueva: `SUPABASE_SERVICE_ROLE_KEY` (server-only, ya debe
existir si el proyecto usa Supabase — si no está, agregarla a `.env.local` y
documentarla junto a las demás en el README/CLAUDE.md de env vars si existiera
esa sección).

## Frontend — componentes

- `app/[slug]/mi-historia/page.tsx`: client component, estado
  `dni`/`cliente`/`mascotas`/`loading`/`notFound`. Reutiliza
  `RegistroClienteDialog` para el caso "no encontrado".
- `app/[slug]/mi-historia/[mascotaId]/page.tsx`: client component. Carga
  mascota + historias + turnos en paralelo (`Promise.all`) al montar. Estados:
  loading / no encontrada / ok.
- `components/turnos/MascotaFotoUploader.tsx` (nuevo, chico): botón cámara +
  input file + mini-diálogo de DNI + llamada a `/api/mascota-foto` + toast de
  éxito/error. Recibe `tenantId`, `mascotaId`, `onFotoSubida(url)` para que el
  padre actualice el estado sin recargar la página.
- Helper de presentación reutilizable para "color/emoji por tipo de mascota":
  ya existe `MASCOTAS_DEFAULT` en `lib/turno-defaults.ts`; se usa tal cual
  para el placeholder del banner sin foto.

## Manejo de errores

- Búsqueda por DNI vacío: deshabilitar el botón "Buscar" (mismo criterio que
  otros formularios del proyecto).
- Error de red en cualquier RPC: toast "No pudimos cargar tus datos, intentá
  de nuevo" (mismo tono que `RegistroClienteDialog`), no se rompe la página.
- Foto: errores de ownership (403) y de cliente no encontrado (404) se
  muestran como texto claro en el mini-diálogo, no como toast genérico —
  ["ese DNI no corresponde a esta mascota"] ayuda a detectar que se
  equivocó de DNI.

## Testing

- Unit: ninguna lógica pura nueva que amerite test dedicado (son
  componentes de datos + presentación, sin cálculo). El único candidato es
  el filtro de turnos por `mascotaId` en el cliente — se cubre con un test
  chico si `lib/supabase/turnos.ts` ya tiene tests de mapeo (`aTurno`); si no
  los tiene hoy, no se agrega infraestructura de test nueva solo para esto.
- Manual: probar con un DNI real de datos demo (`supabase/seeds/`) — buscar,
  entrar al perfil, subir foto, verificar que el banner cambia, verificar que
  un DNI ajeno no puede subir foto a esa mascota (403).

## Preguntas resueltas durante el diseño

- Página propia, no modal.
- Sin resultado → mensaje + CTAs de registro/turno.
- Turnos: todos (pasados y futuros), no solo pendientes.
- Foto: sube vía API route con validación de ownership por DNI, no desde el
  browser directo (mantiene la policy de storage restringida a staff).
