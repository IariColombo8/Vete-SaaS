# Diseño — Cola offline y sincronización del panel

Estado: **propuesta de arquitectura**. Sin código todavía. Alcance inicial: Clientes y Mascotas en `/[slug]/admin`. Extensible a Turnos e Historia Clínica. POS/Ventas queda explícitamente afuera (§9).

Revierte la decisión registrada en `CLAUDE.md` ("offline PWA → Descartado") del port del POS de kiosko.

## 1. El problema real, no el genérico

Hoy toda escritura de clientes/mascotas va directo del navegador a Supabase vía RPCs `security definer` (`guardar_cliente_publico`, `guardar_mascota_publico`, `actualizar_cliente_publico`, `actualizar_mascota_publico`, `supabase/020_clientes_publico.sql`). Si el fetch falla, el formulario tira error y **el dato tipeado se pierde**.

Son dos problemas distintos con soluciones distintas:

| Problema | Síntoma | Solución |
|---|---|---|
| **A. La escritura no llega** | "No se pudo crear el cliente" | Cola de operaciones persistida (§3-§7) |
| **B. La app no carga sin red** | F5 sin señal → pantalla en blanco | Service worker + caché del app shell (§2.3) |

**B es condición necesaria de A.** Una cola en una SPA que no sobrevive un reload es falsa seguridad: el primer refresh deja al usuario con "8 pendientes" y ninguna pantalla para verlos. Por eso la Fase 0 es el service worker, no la cola.

## 2. Persistencia local

### 2.1 Decisión: IndexedDB envuelto en `idb`

| Opción | Veredicto |
|---|---|
| `localStorage` | **No.** API síncrona (bloquea el main thread), ~5 MB, solo strings, sin índices ni transacciones. |
| **IndexedDB vía `idb`** (~1 kB gz) | **Sí.** Async, transaccional, índices compuestos, cuota alta, accesible desde el service worker (necesario si luego se usa Background Sync). `idb` solo pone promesas encima; no es un framework de sync. |
| Dexie | Válido pero ~25 kB y su propio modelo de queries. Innecesario para 4 object stores. |
| Cache Storage | Sí, pero para el **app shell**, no para datos estructurados. |
| RxDB / WatermelonDB / PowerSync | Descartados. Traen su propio motor de replicación y modelo de conflictos: adoptarlos implica reescribir `lib/supabase/*` alrededor de ellos. PowerSync además es pago + sidecar. El problema acá es acotado: dos entidades, escrituras de baja frecuencia, un usuario por dispositivo. |

No usar `localStorage` **ni siquiera para el contador de pendientes**: duplicar el estado de la cola en dos storages es la forma más directa de mostrar "3 pendientes" cuando hay 0.

### 2.2 Object stores (base `vetpanel-offline`, v1)

```
cola            keyPath: opId
  índices: por_tenant (tenantId), por_estado (tenantId, estado), por_orden (tenantId, seq)
espejo_clientes keyPath: [tenantId, id]   índices: por_dni, por_nombre
espejo_mascotas keyPath: [tenantId, id]   índice: por_cliente (tenantId, clienteId)
meta            keyPath: clave            // seq actual, lastPullAt, versión
```

**Todo lleva `tenantId` en la clave o en un índice, sin excepción** — mismo invariante que `SaaS.md` exige en Postgres, y acá importa más: IndexedDB es por origen, no por tenant. Un veterinario con dos tenants, o una máquina de mostrador con dos usuarios, comparten la misma base local. Ninguna query local sin filtrar por el `tenantId` de `useSlug()`.

Corolario: al cerrar sesión se **borran los espejos** del tenant. La cola pendiente no (perder el trabajo al desloguear es peor), pero se advierte si quedan pendientes.

### 2.3 App shell offline (Fase 0)

El proyecto no tiene service worker ni `manifest.json` hoy. Se agrega precache del shell y `NetworkFirst` para documentos de `/[slug]/admin/*` con fallback a página offline.

Dos trampas concretas con App Router:
- **El SW no debe cachear respuestas de Supabase.** Devolver datos viejos desde el SW sin que la app lo sepa produce lecturas fantasma que contradicen el espejo. Regla: el SW cachea assets y HTML; los datos los cachea la app en IndexedDB, explícitamente.
- **El SW invalida al deployar.** Un shell cacheado que referencia chunks `/_next/static/*` borrados por el deploy siguiente rompe la app **online**. Precache versionado por build id, y `skipWaiting` solo con confirmación si hay operaciones en vuelo.

## 3. Detección de conectividad

`navigator.onLine === false` es confiable **en negativo**. El positivo no: solo significa "hay interfaz conectada". El caso típico de una veterinaria — WiFi conectado a un router sin internet — reporta `true`.

**Diseño: detección dirigida por el fallo, confirmada por sonda.** El estado de conectividad no decide si se escribe; siempre se intenta la escritura real y el resultado la clasifica:

```
intentar operación
  ├── ok                                             → aplicar, sacar de la cola
  ├── error de red (TypeError "Failed to fetch",
  │   AbortError por timeout, 502/504 de gateway)    → OFFLINE: encolar, reintentar
  └── error de dominio (PostgREST con code, RAISE
      del plpgsql: CLIENTE_NOT_FOUND, 23505, 401/403) → NO es offline: falla real,
                                                        se le muestra al usuario
```

Confundir ambas categorías es el bug clásico: un `unique violation` de DNI encolado como "problema de red" se reintenta para siempre y nunca se resuelve. La clasificación vive en un solo lugar, `lib/offline/errores.ts` (`esErrorDeRed()`), con tests.

Además:
- **Timeout explícito** por llamada (`AbortController`, ~8 s). Sin esto, una red zombie deja el fetch colgado minutos y la UI parece trabada, no offline.
- **Sonda liviana** (`HEAD` a `${SUPABASE_URL}/rest/v1/` con `apikey`, timeout 3 s) solo cuando el estado es offline (con backoff) o al disparar el evento `online`. Nunca en loop estando online.
- Reintento disparado por: evento `online`, sonda exitosa, `visibilitychange` a visible, y al montar el panel.

`useConectividad()` expone `{ estado: "online" | "offline" | "verificando" }` y es la **única** fuente para la UI.

## 4. IDs: uuid generado en el cliente

Una mascota creada offline necesita apuntar a un `cliente_id` que todavía no existe en el servidor.

- **(a) IDs temporales + remapeo.** Al sincronizar se reescriben todas las referencias. Es lo que hacen los sistemas que no controlan el backend. Costo alto acá: reescribir referencias en espejo, cola y estado de React; y todo id que escapó a un PDF, link o QR queda roto. Fuente principal de bugs sutiles.
- **(b) uuid generado en el cliente, aceptado por el servidor.** `crypto.randomUUID()`; ese id es definitivo desde el primer milisegundo, online u offline. Sin remapeo, sin dos identidades para la misma fila.

**Decisión: (b).** Controlamos las RPCs; no hay razón para pagar (a). Colisión de uuid v4 es un no-problema.

### Cambios en las RPCs

`guardar_cliente_publico(p_tenant, p_datos)` gana `p_id uuid default null`:
- si viene `p_id`, el `INSERT` lo usa;
- si ya existe esa fila **en ese tenant**, se devuelve la existente (idempotencia);
- si el `p_id` existe en **otro** tenant → `raise exception`. Nunca `update` a ciegas por id.

Ídem `guardar_mascota_publico`. Se redefinen con `create or replace` manteniendo la firma vieja por default, así no rompe llamadores actuales (`lib/supabase/clientes.ts`, `mascotas.ts`, el formulario público de turno).

### Idempotencia: `op_id`, separada del id de fila

El id de fila da idempotencia a las **altas**; no a las ediciones ni al merge por DNI (§5), donde repetir la operación duplica entradas en `historial_datos`. Cada operación encolada lleva un `opId` que viaja como `p_op_id` y se registra en:

```sql
create table public.sync_operaciones (
  op_id       uuid primary key,
  tenant_id   text not null references public.tenants(slug),
  entidad     text not null,          -- 'cliente' | 'mascota'
  entidad_id  uuid,
  accion      text not null,          -- 'crear' | 'editar'
  aplicada_en timestamptz not null default now(),
  origen      text                    -- 'offline' | 'online'
);
-- RLS on, policy using (es_staff(tenant_id))
```

Primera línea de cada RPC: si el `op_id` ya está, devolver la fila actual sin tocar nada. Esto cubre el caso más molesto de toda cola: **la operación llegó y se aplicó, pero la respuesta se perdió**. Sin `op_id`, el reintento duplica el historial o pisa una edición posterior. `sync_operaciones` es además el log de auditoría de la sincronización.

## 5. Conflictos

### El caso real

Mostrador A (sin señal) edita el teléfono del cliente con DNI 30.111.222. Mostrador B (online) edita el email del mismo cliente. Con el comportamiento actual — `coalesce(p_datos->>'campo', campo)` sobre un payload que manda *todos* los campos del formulario — A pisaría el email de B con su valor de hace 40 minutos. **Last-write-wins a nivel fila.** Ya es un bug latente hoy entre dos pestañas online; offline solo lo hace frecuente.

### Decisión: last-write-wins **por campo**, sobre campos realmente tocados

1. **La operación guarda solo los campos que el usuario modificó**, no el formulario entero. `updateMascota` ya hace algo parecido; `updateCliente` manda todo. Se unifica con un diff contra el valor cargado en el formulario. Si A tocó solo `telefono`, el email de B ni se menciona y no se puede pisar. Resuelve ~90% de los casos reales y es barato. No es un CRDT ni pretende serlo.
2. **`p_base_updated_at`** — el `updated_at` que tenía la fila al empezar a editar. Si algún campo del payload cambió en el servidor después de ese ts, hay conflicto real sobre ese campo.

### `historial_datos` es la pieza que ya teníamos

Las RPCs ya escriben `{campo, valorAnterior, valorNuevo, fechaCambio}`. **Sí, conviene apoyarse en eso**: es exactamente el registro que un merge necesita y ya está en producción con datos reales. Extensión mínima del objeto:

```json
{ "campo": "telefono", "valorAnterior": "...", "valorNuevo": "...",
  "fechaCambio": "<ts del servidor al aplicar>",
  "fechaOrigen": "<ts del dispositivo al tipear>",
  "origen": "offline", "opId": "...", "conflicto": true }
```

| Situación | Resolución |
|---|---|
| Nadie más tocó el campo | Se aplica, sin ruido |
| Otro dispositivo lo tocó después del `base_updated_at` | **Gana el servidor.** La versión offline no se descarta: se asienta en `historial_datos` con `conflicto: true` y su `fechaOrigen`, y se marca la fila para revisión (§7) |
| Alta offline con DNI ya existente | **Merge, no error** — es lo que `guardar_cliente_publico` ya hace. El `unique (tenant_id, dni)` convierte el DNI en clave natural de deduplicación y elimina el peor escenario: dos fichas del mismo cliente |
| Alta offline **sin DNI** (es nullable) | Sin clave natural → puede duplicarse. Se mitiga con detección de posible duplicado por `(nombre, telefono)` que **sugiere** fusionar. No automático: dos "Juan Pérez" distintos existen |
| Mascota offline ya existente en ese cliente | `guardar_mascota_publico` ya deduplica por `slug = nombre-tipo` y devuelve la existente. Sirve tal cual |

**Por qué gana el servidor y no "el más nuevo por reloj del cliente":** una tablet de mostrador con la hora corrida dos días decidiría todos los conflictos a su favor para siempre. `fechaOrigen` se guarda como dato informativo para que un humano decida, nunca como desempate automático.

**No** se agrega tabla `conflictos`: el conflicto es un atributo de la fila y vive en su historial. Una tabla aparte sería un segundo lugar donde la verdad puede desincronizarse.

## 6. RLS y seguridad

**Para reproducir las operaciones, las RPCs existentes alcanzan.** Son `security definer`, no pasan por RLS, validan `tenant_id` adentro y están grantadas a `anon`/`authenticated`. Reproducir una operación encolada es exactamente la misma llamada que se habría hecho online. No hace falta tocar policies de `clientes` ni `mascotas`.

Lo que sí hace falta: `sync_operaciones` con `tenant_id not null references tenants(slug)`, RLS on y policy `using (es_staff(tenant_id))` para lectura; la escritura la hace la RPC, no el cliente (checklist de `SaaS.md`). Y que las ramas nuevas de las RPCs (la del id provisto) sigan validando `tenant_id`.

**Dos cosas para mirar:**

**(a) Hueco preexistente, no introducido por este diseño.** `actualizar_cliente_publico` y `actualizar_mascota_publico` están grantadas a `anon`. Un anónimo que conozca un `uuid` de cliente y el slug del tenant puede editar nombre, teléfono, email, DNI y domicilio de esa persona. El uuid actúa como secreto pero nunca se diseñó como tal: circula en URLs y en estado del cliente. Aceptar `p_id` del cliente amplía un poco la superficie (ahora también se pueden *elegir* ids). Antes de la Fase 2 conviene restringir el grant de las funciones de **actualizar** a `authenticated` y exigir `es_staff(p_tenant)` (o "es el dueño del email de la sesión") dentro de la función, dejando en `anon` solo lo que el formulario público de turno necesita. Merece tarea y review de seguridad propios; no se mezcla con la cola.

**(b) Datos personales en disco de máquina compartida.** El espejo pone nombre, DNI, teléfono, domicilio y mascotas en IndexedDB sin cifrar, sobreviviendo al logout si no se limpia. Reglas: espejar solo contacto y mascotas; **nunca historia clínica en Fases 1-2**; borrar espejos al cerrar sesión y al cambiar de tenant; TTL de purga; nada del panel `superadmin`.

## 7. UX de la cola

```
pendiente → enviando → aplicada            (se borra tras confirmar)
                    ↘ reintentando         (error de red)
                    ↘ conflicto            (aplicada parcialmente, revisar)
                    ↘ requiere_atencion    (error de dominio o límite de reintentos)
```

- **Indicador permanente en el sidebar** (`components/vet-admin-sidebar.tsx`): chip "Sin conexión · 3 pendientes". Visible siempre, no un toast que se va. Neutro cuando está todo sincronizado — el usuario tiene que poder confirmar activamente que su trabajo llegó.
- **Marca por fila.** El cliente creado offline aparece en la lista normalmente (viene del espejo) con un reloj "pendiente de sincronizar". Lo peor sería ocultarlo hasta que sincronice: el usuario lo vuelve a cargar y duplica.
- **Panel de pendientes** (Sheet desde el chip): qué es, cuándo se creó, estado, error. Acciones: *Reintentar ahora*, *Editar y reintentar*, *Descartar*.
- **Confirmación explícita al descartar**, con el dato a la vista. Es la única forma de perder trabajo; tiene que costar.
- **Advertencia al cerrar sesión o la pestaña** con pendientes (`beforeunload`).
- **Conflictos**: badge en la ficha, "este dato fue modificado en otro dispositivo", con el valor offline tomado de `historial_datos` y un botón para aplicarlo.

**Reintentos:**
- Backoff exponencial con jitter: 2 s, 5 s, 15 s, 1 m, 5 m, 15 m (tope).
- **Sin límite mientras el error sea de red.** Cuatro días sin señal no es motivo para tirar el dato.
- **Un reintento y a `requiere_atencion` si el error es de dominio.**
- **Procesamiento serial por tenant en orden de `seq`.** Si *crear cliente X* está pendiente, *crear mascota de X* no se intenta. Paralelizar no compra nada y rompe dependencias.
- Una operación en `requiere_atencion` bloquea a **sus dependientes**, no a toda la cola.
- **Un solo worker activo entre pestañas** vía `navigator.locks.request`. Aun si falla, `op_id` hace el duplicado inofensivo: el lock evita el ruido, la idempotencia evita el daño.

## 8. Cómo encaja en lo que existe

La cola **no se mete en los componentes**: se mete debajo de `lib/supabase/*`, la capa que los componentes ya usan.

```
componente → lib/supabase/clientes.ts → lib/offline/ejecutar.ts
                                            ├── online:  supabase.rpc(...)
                                            └── falla de red: encolar + aplicar al espejo
                                                             + devolver el objeto optimista
```

`createCliente` sigue devolviendo `{ id, ...cliente }` como hoy; la diferencia es que el `id` lo generó el cliente. Los componentes de `components/admin/` no cambian salvo para mostrar el estado de sync.

Las **lecturas** van stale-while-revalidate contra el espejo: IndexedDB al instante, revalidar contra Supabase, y **superponer siempre las operaciones pendientes** sobre lo que llegue del servidor (si no, un pull online "revierte" visualmente una edición pendiente y el usuario la rehace).

### Archivos y tablas nuevos

```
lib/offline/db.ts             → apertura/migración de IndexedDB (idb)
lib/offline/cola.ts           → encolar, listar, marcar, descartar
lib/offline/errores.ts        → esErrorDeRed(); testeado
lib/offline/conectividad.ts   → sonda + estado; sin React
lib/offline/sincronizador.ts  → orden, backoff, dependencias, Web Locks
lib/offline/ejecutar.ts       → wrapper online-o-encolar sobre lib/supabase/*
lib/offline/espejo.ts         → read/write del espejo
lib/offline/tipos.ts
hooks/offline/useConectividad.ts
hooks/offline/useColaPendiente.ts
components/admin/offline/indicador-sync.tsx
components/admin/offline/panel-pendientes.tsx
app/offline/page.tsx          → fallback del service worker
public/manifest.json + service worker (Fase 0)

supabase/045_offline_sync.sql
  - tabla sync_operaciones (+ RLS es_staff)
  - guardar_cliente_publico    → + p_id, p_op_id, p_base_updated_at
  - guardar_mascota_publico    → + p_id, p_op_id
  - actualizar_cliente_publico → + p_op_id, p_base_updated_at, merge por campo
  - actualizar_mascota_publico → + p_op_id, p_base_updated_at
```

Convenciones que aplican: español en nombres y UI, sin `any`, sin `console.log` de debug, archivos chicos, migración SQL numerada e idempotente para el SQL Editor.

## 9. Fases

**Fase 0 — Que la app sobreviva sin red.** Service worker + manifest + página offline + `useConectividad()` + indicador en el sidebar. **Sin cola**: el formulario sigue fallando, pero avisa bien ("sin conexión", no "error desconocido"). Entregable chico y verificable por sí mismo. Sin esto nada de lo demás sirve.

**Fase 1 — Altas offline de cliente y mascota.** `045_offline_sync.sql` (ids del cliente + `op_id` + `sync_operaciones`), cola, espejo mínimo, sincronizador con backoff, panel de pendientes. Solo `crear`. El merge por DNI ya existente cubre el conflicto principal sin código nuevo. **Es el 80% del valor para el mostrador.**

**Fase 2 — Ediciones offline.** Diff por campo, `p_base_updated_at`, política de conflicto y su UI. Requiere antes el hardening del grant `anon` de §6(a). Es la fase con más riesgo de pisar datos; no adelantarla.

**Fase 3 — Turnos.** `crear_turno` tiene validación de cupo server-side (`044_crear_turno_limite_server_side.sql`). Un turno creado offline **puede ser rechazado legítimamente al sincronizar** porque el horario se llenó. Eso no es un error técnico: es un estado de negocio con UX propia ("no se pudo confirmar, elegí otro horario") y probablemente confirmación al cliente por WhatsApp/email recién al sincronizar.

**Fase 4 — Historia clínica.** Más riesgo de privacidad (§6b), dato legalmente sensible, y adjuntos (fotos, firmas, PDFs) que hay que encolar como blobs. Recién con 1-3 estables en producción.

**Fuera de alcance — POS / Ventas / Caja.** `registrar_venta` descuenta stock, escribe `stock_movimientos` y asigna un **correlativo de remito sin agujeros**, en una transacción. Offline implicaría: stock contra espejo desactualizado → sobreventa; numeración asignada en el cliente → correlativos corridos o duplicados entre mostradores, que es un problema contable, no de software; anulaciones y cuenta corriente que dependen del orden real de los eventos. Si alguna vez hace falta, el camino no es esta cola: es un rango de numeración pre-reservado por dispositivo y un modelo de stock que tolere negativos con conciliación posterior. Otro diseño.

## 10. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| SW cacheando chunks viejos post-deploy | Rompe la app **online**, para todos | Precache versionado por build id; sin `skipWaiting` automático; probar el deploy |
| Dos pestañas drenando la cola | Operaciones duplicadas | Web Locks + `op_id` idempotente |
| Reloj del dispositivo corrido | Conflictos mal resueltos | Desempate del lado del servidor; ts del cliente informativo |
| Espejo con datos personales en máquina compartida | Exposición de datos | Limpiar al logout, TTL, espejar lo mínimo, nada clínico en Fases 1-2 |
| Cuota de IndexedDB agotada / storage evictado | Pérdida silenciosa de la cola | `navigator.storage.persist()`, monitorear `estimate()`, avisar sobre umbral |
| Cliente sin DNI cargado en dos dispositivos | Fichas duplicadas | Sugerencia de duplicado por nombre+teléfono; fusión manual |
| Error de dominio clasificado como de red | Reintentos infinitos | `esErrorDeRed()` en un solo lugar con tests; tope para no-red |
| Cola que crece y nadie mira | Trabajo perdido meses después | Indicador permanente, advertencia al desloguear, alerta si hay pendientes > 24 h |
| Superficie nueva grande (cola + espejo + SW) | Bugs en un panel que hoy funciona | Fases chicas desplegables; Fase 0 sin cola; nada toca POS/Ventas |

## 11. Qué testear

- `esErrorDeRed()`: matriz de errores reales de fetch / PostgREST / plpgsql.
- `cola.ts`: orden por `seq`, dependencias, transiciones de estado — puro, sin red.
- Idempotencia de las RPCs: el mismo `op_id` dos veces no duplica `historial_datos` ni la fila (integración contra Postgres).
- Merge por campo: A edita teléfono offline, B edita email online → quedan los dos.
- Aislamiento: operación encolada con `tenant_id` ajeno rechazada por la RPC — va en `vitest.rules.config.ts` con el resto de los tests de RLS.
- E2E: crear cliente + mascota con red cortada en DevTools, recargar, restaurar red, verificar que existen en Supabase con los ids que se vieron en pantalla.

---

## Hallazgo de seguridad preexistente (no introducido por este diseño)

`actualizar_cliente_publico` y `actualizar_mascota_publico` en `supabase/020_clientes_publico.sql` tienen `grant execute ... to anon`. Con el slug del tenant y un uuid de cliente, un anónimo puede editar nombre, teléfono, email, DNI y domicilio de esa persona. El uuid actúa como secreto pero nunca se diseñó como tal: circula en URLs y en estado del cliente. Merece revisión y fix aparte, no mezclado con la cola offline. Ver §6(a).
