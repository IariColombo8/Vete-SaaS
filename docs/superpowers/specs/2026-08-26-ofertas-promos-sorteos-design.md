# Ofertas, Promociones y Sorteos — diseño (sub-proyecto 1: base)

Fecha: 2026-08-26

## Contexto y alcance

El pedido original incluye cuatro piezas: (1) sección admin de ofertas/promos/sorteos, (2)
alta pública de clientes, (3) cambios en el home (banner de sorteo activo, promos en la
pestaña "Productos"), (4) envío de mail masivo a contactos con la promo/oferta/sorteo
armado. Son subsistemas independientes: este spec cubre solo **(1) y (2)**, la base de
datos y de gestión de la que dependen los otros dos. El banner de sorteo en el home, las
promos mostradas en el home público, y el envío de mails masivos se diseñan en specs
separados una vez que esta base esté implementada.

## Modelo de datos

### Ofertas (sin tabla nueva)

Las ofertas siguen viviendo en `productos` (`oferta_activa`, `oferta_tipo`, `oferta_valor`,
`oferta_cantidad`, `oferta_hasta` — ya existen desde `004_productos.sql` y `016_oferta_vencimiento.sql`).
No se crea nada nuevo para ofertas. Cambia solo dónde se editan: se retira el control de
oferta del diálogo de producto (`components/admin/productos/*`) y pasa a vivir en la
pestaña "Ofertas" de la nueva sección.

### Promociones (`supabase/020_ofertas_promos_sorteos.sql`)

```sql
create table public.promociones (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(slug),
  nombre              text not null,
  descripcion         text,
  precio_final        numeric(12,2) not null,   -- precio fijo de todo el combo
  activa              boolean not null default true,
  desde               date,                     -- null = sin fecha de inicio
  hasta               date,                     -- null = sin vencimiento
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.promocion_items (
  id                  uuid primary key default gen_random_uuid(),
  promocion_id        uuid not null references public.promociones(id) on delete cascade,
  producto_id         uuid not null references public.productos(id),
  cantidad            integer not null check (cantidad > 0)
);
```

RLS: `es_staff(tenant_id)` para todo (select/insert/update/delete), igual criterio que
`productos`.

Una promoción es válida si `activa` y la fecha actual está entre `desde`/`hasta` (nulls
son extremos abiertos). El "precio final" es el monto fijo por el combo completo — no un
% (ver decisión abajo). Un producto regalado se modela como un item de la promo cuyo
costo ya está absorbido en `precio_final` (ej: A cuesta $5000, B se regala,
`precio_final` = precio de A).

### Sorteos

```sql
create type sorteo_estado as enum ('borrador', 'activo', 'finalizado');

create table public.sorteos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(slug),
  nombre              text not null,
  descripcion         text,
  foto_url            text,
  desde               date not null,
  hasta               date not null,
  estado              sorteo_estado not null default 'borrador',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sorteos_fechas_ck check (hasta >= desde)
);

create table public.sorteo_premios (
  id                  uuid primary key default gen_random_uuid(),
  sorteo_id           uuid not null references public.sorteos(id) on delete cascade,
  orden               integer not null,         -- orden de sorteo: 1er premio, 2do, ...
  nombre              text not null,
  descripcion         text,
  foto_url            text
);

create table public.sorteo_ganadores (
  id                  uuid primary key default gen_random_uuid(),
  sorteo_id           uuid not null references public.sorteos(id) on delete cascade,
  premio_id           uuid not null references public.sorteo_premios(id),
  cliente_id          uuid not null references public.clientes(id),
  venta_id            uuid not null references public.ventas(id), -- la venta cuya chance salió sorteada
  sorteado_en         timestamptz not null default now(),
  unique (premio_id) -- un solo ganador por premio
);
```

RLS: `es_staff(tenant_id)` (sorteos vía join a tenant_id, ganadores/premios heredan del
sorteo). El `foto_url` de sorteo y de cada premio son opcionales y usan Supabase Storage,
igual patrón que fotos de productos/tenant.

**Chances**: no se persisten como filas propias. Se calculan on-demand a partir de
`ventas` con `cliente_id is not null`, `tenant_id` del sorteo, `anulada = false`
(o el criterio equivalente que ya use `ventas` para excluir anuladas) y
`created_at between sorteos.desde and sorteos.hasta`. Cada venta = 1 chance. La vista de
participantes agrupa por `cliente_id` mostrando el conteo ("Iara — 10 chances").

Sortear un premio: sobre el conjunto de chances restantes (excluyendo clientes ya
ganadores de premios anteriores de este sorteo), elegir aleatoriamente una chance con
probabilidad proporcional a la cantidad de chances de cada cliente (equivalente a poner
una bolita por chance y sacar una al azar). Se repite premio por premio, sin reemplazo de
cliente, hasta cubrir `sorteo_premios`. El resultado (incluyendo qué venta específica
"ganó", elegida al azar entre las del cliente ganador) se graba en `sorteo_ganadores`.
Esto es determinístico una vez sorteado — sortear de nuevo un sorteo ya finalizado no
está permitido desde la UI (habría que reabrirlo a mano en la base si hace falta
rehacerlo).

## Pantallas admin

Ruta: `app/[slug]/(vetadmin)/promos-sorteos/page.tsx` (URL corta y consistente con las
demás rutas del panel). Tabs: **Ofertas** | **Promociones** | **Sorteos**.

### Tab Ofertas

- Listado de productos con `oferta_activa = true` (nombre, tipo de oferta, precio con
  oferta, vencimiento).
- Buscador de producto (igual componente que usa ventas/pos) + formulario para activar
  oferta: tipo (monto/porcentaje/combo), valor, cantidad (si combo), vencimiento
  opcional. Es el mismo formulario que hoy vive en el diálogo de producto — se mueve,
  no se duplica.
- Se elimina el control de oferta de `components/admin/productos/*` (el diálogo de
  producto deja de tener esa sección; un link "gestionar oferta en Promos y Sorteos"
  opcional si el producto ya tiene oferta activa, para navegación rápida).

### Tab Promociones

- Listado de promociones (nombre, productos incluidos, precio final, vigencia, activa/no).
- Alta/edición: nombre, descripción, selector de productos + cantidad de cada uno
  (agregar líneas), precio final del combo, fechas desde/hasta (opcionales).
- Borrado o desactivación (no borrar si tiene ventas históricas asociadas — de todos
  modos no se registra qué venta usó qué promo en detalle salvo lo que ya guarda
  `venta_items` como snapshot de precio).

### Tab Sorteos

- Listado de sorteos con estado (borrador/activo/finalizado) y fechas.
- Alta/edición: nombre, descripción, foto opcional, fechas desde/hasta, lista de premios
  (agregar/quitar, cada uno con nombre + descripción + foto opcional).
- Detalle de un sorteo: tabla de participantes agrupados por cliente con su cantidad de
  chances, ordenada de mayor a menor. Botón "Sortear" (deshabilitado si el sorteo no
  llegó a `hasta` o si ya está finalizado) que ejecuta el sorteo premio por premio y
  pasa el estado a `finalizado`. Muestra los ganadores con su premio si ya se sorteó.

## POS

- `lib/ventas/carrito.ts` gana una función que, dado el carrito actual y las promociones
  activas del tenant, detecta si las cantidades de productos de alguna promo están
  presentes y aplica el `precio_final` a ese subconjunto de unidades (mismo patrón que ya
  usa el combo de oferta de un solo producto: se calcula sobre unidades, no reemplaza
  líneas). Aplica automáticamente sin acción del vendedor.
- Se agrega un botón "Ofertas/Promociones" en `components/admin/pos/*` que abre un panel
  con las ofertas y promociones activas vigentes; click en una la agrega al carrito
  manualmente (por si el vendedor prefiere forzarla o el algoritmo automático no la
  disparó por algún motivo de cantidades).

## Alta pública de cliente

Ruta pública `app/[slug]/cliente/page.tsx`, sin autenticación. Formulario: nombre
(requerido), teléfono, email, DNI (opcional), domicilio (opcional). Al enviar llama a
`createCliente(tenantId, data)` (ya existe en `lib/supabase/clientes.ts`, hace upsert por
DNI si coincide). Mensaje de éxito simple; no requiere pantalla de "mis datos" ni edición
posterior (eso ya existe del lado admin).

## Permisos y plan

- `lib/plans.ts`: nueva feature `promosSorteos`, disponible desde el plan **Pro** (mismo
  criterio que `ventas`/`pos`/`caja`).
- `lib/auth/permissions.ts`: sección `promosSorteos` visible para `veterinario` y
  `empleado`.
- `components/navbar.tsx`: agregar `/promos-sorteos` al regex `isVetAdmin` (y `/cliente`
  se mantiene fuera, es público, navbar público normal).
- `components/vet-admin-sidebar.tsx`: agregar ítem en el grupo **Comercio**.

## Fuera de alcance de este spec

- Banner "Sorteos" en el home (solo si hay uno activo).
- Mostrar promociones en la pestaña "Productos" del home público.
- Envío de mail masivo a contactos con oferta/promo/sorteo armado.

Estos se diseñan como specs independientes una vez que la base de datos y las pantallas
admin de este documento estén implementadas.
