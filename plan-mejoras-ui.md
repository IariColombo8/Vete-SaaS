# Plan de mejoras — estilo del panel y cartelitos de ayuda

> Estado: **Fase 1 implementada** (2026-10-04), sin commitear. Fases 2 a 5 pendientes.
>
> Lo hecho en la Fase 1:
> - `components/ui/ayuda.tsx` + `lib/ayuda/textos.ts`: 19 cartelitos en Caja, Vender,
>   Productos, Cta Cte, Promos, Configuración, Equipo, QR de libreta y Dashboard.
>   Abren con click/tap (no con hover). Textos verificados contra el código.
> - Se descartaron 3 textos del borrador (anular venta, stock mínimo, recordatorio de
>   vacuna) porque esas pantallas ya lo explican. El recordatorio es solo por WhatsApp,
>   no por email.
> - `components/admin/tour-pagina.tsx` + `lib/ayuda/tours.ts`: tours de Dashboard,
>   Vender y Caja, montados en `vet-admin-layout.tsx`. "Ayuda" abre el de la pantalla
>   actual. Solo el del Dashboard arranca solo; los otros, a pedido, para no
>   interrumpir a quien atiende. Reemplaza a `dashboard-tour.tsx` (borrado).
> - `components/admin/estado-vacio.tsx` en Cta Cte, historial de ventas y de cajas,
>   ofertas, promociones y sorteos.
> Alcance: solo el panel veterinario (`app/[slug]/(vetadmin)/`, `components/admin/`,
> `components/vet-admin-*`). La landing y la página pública quedan afuera.

---

## 0. Regla número uno: hay 2 clientes reales usando el sistema

Todo lo de este plan es **visual**: clases CSS, textos y componentes de
presentación. En ninguna fase hace falta:

- migraciones SQL, ni cambios en `supabase/`, RLS, RPC o triggers;
- cambios en `lib/supabase/*` (capa de datos) ni en `app/api/*`;
- cambios en la lógica de `lib/ventas/carrito.ts`, `lib/productos/precios.ts`
  o en el remito PDF.

Si alguna tarea termina pidiendo tocar alguna de esas cosas, **se sale de este plan**:
se frena y se discute aparte.

**Cómo se prueba sin tocar datos reales**

1. Probar solo en `localhost` con un **tenant de prueba** (crear uno tipo `demo-vet`),
   nunca entrando al panel de los dos tenants reales con un usuario que pueda escribir.
2. En las pantallas con escritura (Vender, Caja, Cta Cte, Productos), probar los
   cambios visuales **sin confirmar operaciones**: abrir el diálogo, mirarlo y cancelar.
   Abrir una caja o registrar una venta deja un correlativo que no se puede borrar
   (ver CLAUDE.md, "Ventas, caja y remitos").
3. Cada fase va en **commits chicos, uno por pantalla**, así un problema se revierte
   con `git revert` sin arrastrar el resto.
4. Antes de cada commit: `npx tsc --noEmit`, `npm run lint`, `npm test` y `git status`
   (que no aparezca nada borrado o modificado sin querer).
5. Los cambios se suben a Vercel de a una fase, y después se revisa el panel de los
   tenants reales **en modo lectura** (solo navegar).

---

## 1. Diagnóstico (qué encontré)

### 1.1 El panel tiene dos estilos distintos según la sección

| Grupo | Archivos | Estilo |
|------|----------|--------|
| **Clínica** (Dashboard, Turnos, Libreta, Clientes, Historias) | `libreta-sanitaria-management.tsx`, `clientes-management.tsx`, `historias-management.tsx`, `dashboard-charts.tsx`, `turnos-management.tsx`, modales de turno/libreta | Colores escritos a mano: `slate-*` / `emerald-*` con su `dark:` repetido al lado. Título `text-sm sm:text-xl lg:text-3xl font-black`. |
| **Comercio** (Vender, Productos, Ventas, Caja, Cta Cte, Promos) y Configuración | `pos/*`, `productos/*`, `ventas/*`, `caja-management.tsx`, etc. | Tokens de shadcn (`bg-card`, `text-muted-foreground`, `primary`). Título `text-2xl font-bold tracking-tight`. |

Números: ~1.400 usos de colores fijos en `components/admin`. Los que más tienen son
`libreta-sanitaria-management.tsx` (166), `clientes-management.tsx` (110),
`historias-management.tsx` (100) y `dashboard-charts.tsx` (76).

Consecuencia: al pasar de "Clientes" a "Productos" en el sidebar, cambian el título,
el gris de fondo, los bordes y el verde. Parece otro sistema.

### 1.2 Los tokens de color están a medio configurar

- `app/globals.css` define bien `--primary` (verde, hue 160) y `--radius: 1rem`, pero
  **los tokens `--sidebar-*` siguen siendo los grises por defecto de shadcn**. En modo
  oscuro `--sidebar-primary` es un **azul violeta** (`oklch(0.488 0.243 264)`) que no
  tiene nada que ver con la marca.
- El icono activo del sidebar se pinta con `text-emerald-600` fijo, y no con el token.
- `styles/globals.css` es un **archivo muerto**, con la paleta neutra de shadcn: no lo
  importa nadie (`app/layout.tsx` importa `./globals.css`). Confunde a quien lo abre.
- No hay tokens semánticos para estados (éxito / aviso / peligro / info). Por eso cada
  badge de "pagado", "vencido", "stock bajo" o "caja abierta" inventa su propia combinación
  de `emerald`/`amber`/`red`.

### 1.3 Tipografía

`layout.tsx` carga DM Sans + **Fraunces** (`--font-display`), pero el panel no la usa
nunca: aparece 0 veces en `components/admin`, solo en la landing. Los títulos del panel
usan la fuente del cuerpo con pesos que cambian según la pantalla (`font-black`,
`font-bold`, `font-extrabold`).

### 1.4 Detalles sueltos

- **Tildes que faltan en Configuración**: "Anticipacion minima", "Descripcion",
  "Direccion", "Telefono", "Duracion", "Modalidad de atencion", "Cupo simultaneo".
- **`confirm()` nativo del navegador** en `historias-management.tsx:427` (eliminar
  consulta) y `promos-sorteos/promociones-tab.tsx:83` (eliminar promoción). El resto del
  panel usa `AlertDialog`. El nativo se ve feo y en el celular es confuso.
- **Botones de solo icono sin `aria-label`** en Clínica (0 en libreta, clientes,
  historias y turnos). En Comercio sí están.
- **Estados de carga desparejos**: Clientes e Historias usan `Skeleton`. Turnos, Caja,
  Ventas y Dashboard muestran un spinner o directamente nada.
- **Estados vacíos sin guía**: "No hay X" a secas, sin decir qué hacer
  (por ejemplo "Todavía no cargaste productos → Importar Excel / Nuevo producto").
- **Archivo gigante**: `libreta-sanitaria-management.tsx` tiene 3.151 líneas.
  Cualquier cambio de estilo ahí es delicado. No se refactoriza en este plan:
  solo se reemplazan clases, con búsqueda acotada.

### 1.5 Ayuda: qué hay hoy

- Hay un **tour con driver.js** (`components/admin/dashboard-tour.tsx`), pero solo
  recorre el Dashboard y el sidebar.
- El botón **"Ayuda"** del header (`vet-admin-layout.tsx:141`) **siempre manda al
  Dashboard** (`?tour=1`), aunque el usuario esté en Caja. Saca a la persona de donde
  estaba.
- **No existe ningún cartelito de ayuda contextual.** `Tooltip` solo se usa en los
  gráficos y en el sidebar colapsado.
- Hay muchos términos que un empleado nuevo no entiende solo: *arqueo*, *saldo
  inicial*, *esperado vs. contado*, *Cta Cte*, *cupo simultáneo*, *anticipación mínima*,
  *margen / % de ganancia*, *precio por kilo*, *combo "cada cuántas unidades"*,
  *pago mixto*, *chances del sorteo*, *QR de libreta*, *borrador*.

---

## 2. Fases

Orden pensado para que **cada fase deje el sistema mejor y se pueda subir sola**.
De menos riesgo a más.

### Fase 1 — Cartelitos de ayuda (lo que más se nota, riesgo casi nulo)

**1.a Componente `<Ayuda>`** (`components/ui/ayuda.tsx`)

- Un iconito `CircleHelp` (lucide) de 14px en `text-muted-foreground`, que va al lado
  del label o del título.
- Usa **`Popover`** y no `Tooltip`: el tooltip de Radix no abre con el dedo en el
  celular, y buena parte del uso es en el mostrador con tablet o teléfono. Abre con
  click o tap y también con hover en desktop.
- Accesible: es un `<button type="button" aria-label="Ayuda: {tema}">` (así no envía el
  formulario donde esté) y se puede abrir con el teclado.
- Props: `tema` (clave del texto) o `children` para casos puntuales.

```tsx
<Label className="flex items-center gap-1.5">
  Saldo inicial <Ayuda tema="caja.saldoInicial" />
</Label>
```

**1.b Textos centralizados** (`lib/ayuda/textos.ts`)

Todos los textos van en un solo objeto tipado. Así se corrigen en un solo lugar, se
pueden revisar con los dos clientes y no quedan desparramados por 60 archivos.
Tono: segunda persona, voseo, una o dos oraciones, sin tecnicismos.

Primer lote propuesto (para revisar el texto antes de programar):

| Pantalla | Clave | Texto |
|---------|-------|-------|
| Caja | `caja.saldoInicial` | La plata que hay en el cajón al abrir, por ejemplo el cambio. Se suma a lo que vendas en efectivo. |
| Caja | `caja.arqueo` | Contar la plata del cajón y compararla con lo que el sistema dice que debería haber. |
| Caja | `caja.esperado` | Saldo inicial más las ventas en efectivo de este turno. Las ventas anuladas no cuentan. |
| Caja | `caja.diferencia` | Contado menos esperado. Si es negativo, falta plata; si es positivo, sobra. |
| Vender | `pos.sinCaja` | Podés vender sin caja abierta: la venta se guarda igual, pero no entra en ningún arqueo. |
| Vender | `pos.mixto` | Para cuando te pagan una parte en efectivo y otra con tarjeta o transferencia. |
| Vender | `pos.descuento` | El porcentaje se calcula sobre el total con las ofertas ya aplicadas. |
| Ventas | `ventas.anular` | Anular devuelve el stock y deja la venta marcada. No se borra, para que la numeración de remitos no tenga saltos. |
| Productos | `productos.precioKg` | Si el producto se vende suelto por kilo, este es el precio de 1 kg. |
| Productos | `productos.stockMinimo` | Cuando el stock llega a este número, el producto aparece como "stock bajo". |
| Productos | `productos.margen` | Porcentaje que se suma al costo para calcular el precio de venta. |
| Productos | `productos.combo` | Por ejemplo "3x2": cada 3 unidades, el cliente paga el precio del combo. |
| Productos | `productos.unidadesBulto` | Cuántas unidades trae la caja o el bulto que le comprás al proveedor. |
| Cta Cte | `ctacte.queEs` | Lo que cada cliente te debe. Se suma con cada cargo o venta "a cuenta" y baja con cada pago. |
| Promos | `sorteos.chances` | Cómo suma chances un cliente para el sorteo (por compra, por monto, etc.). |
| Config · Turnos | `config.duracion` | Cuánto dura cada turno de este servicio. Define los horarios que se ofrecen. |
| Config · Turnos | `config.cupo` | Cuántos turnos pueden reservarse para la misma hora (por ejemplo, si atienden 2 veterinarios). |
| Config · Turnos | `config.anticipacion` | Con cuántas horas de anticipación, como mínimo, se puede sacar un turno online. |
| Config · Turnos | `config.horariosPropios` | Si este servicio tiene otro horario que la clínica (por ejemplo, peluquería solo a la mañana). |
| Config · Equipo | `config.roles` | Veterinario: ve todo, incluida la configuración. Empleado: turnos, clientes y mostrador, sin configuración. |
| Libreta | `libreta.qr` | El QR abre la libreta de la mascota sin iniciar sesión. Dáselo solo al dueño. |
| Libreta | `libreta.recordatorio` | Le avisa al dueño por WhatsApp o email que se acerca la próxima vacuna. |
| Clientes | `clientes.borrador` | Si cerrás sin guardar, los cambios quedan como borrador en este navegador y te los ofrecemos la próxima vez. |
| Dashboard | `dashboard.usoPlan` | Turnos usados este mes sobre el máximo de tu plan. Se reinicia el día 1. |

> Antes de dar por buenos los textos de Caja, Cta Cte y Sorteos, conviene validarlos
> contra el código real (`cerrar_caja`, `registrar_venta`) y mostrárselos a uno de los
> dos clientes: son los que tienen que entenderlos.

**1.c El botón "Ayuda" del header pasa a ser contextual**

- Hoy: siempre va a `Dashboard?tour=1`.
- Propuesta: abre el tour **de la página en la que estás**. `dashboard-tour.tsx` se
  generaliza a `<TourPagina pasos={…} clave="caja" />`, y la página que no tenga tour
  propio sigue usando el del Dashboard.
- Los primeros tours: **Vender** (buscar, carrito, cobrar, remito) y **Caja** (abrir,
  arquear, cerrar). Son los flujos donde un empleado nuevo se traba y donde un error
  cuesta plata.
- La marca de "ya visto" sigue en `localStorage`, con `try/catch` alrededor: si el
  navegador lo bloquea, el tour no puede romper la página.

**1.d Estados vacíos que guían**

Un componente `components/admin/estado-vacio.tsx` (sobre `ui/empty.tsx`, que ya existe)
con icono, una línea que explica y el botón de la acción siguiente. Va en Productos,
Ventas, Clientes, Cta Cte, Promos y Turnos del día.

**Riesgo:** bajo. Solo se agregan elementos, no se cambia nada de lo que ya funciona.

---

### Fase 2 — Arreglos rápidos (riesgo bajo)

1. Agregar las tildes en los labels de Configuración.
2. Reemplazar los dos `confirm()` nativos por `AlertDialog` (el mismo patrón que ya
   usan Ventas y Productos). **Ojo:** el borrado sigue llamando exactamente a la misma
   función, lo único que cambia es el diálogo de confirmación.
3. `aria-label` en todos los botones de solo icono de Clínica.
4. Borrar `styles/globals.css`, **por nombre exacto**, después de confirmar con
   `grep -r "styles/globals"` que no lo importa nadie (regla de CLAUDE.md).

---

### Fase 3 — Unificar tokens de color (riesgo medio)

1. **Corregir los tokens `--sidebar-*`** en `app/globals.css` para que usen la paleta de
   la marca (fondo apenas cálido, activo con `--primary`) en claro **y** en oscuro.
   Se elimina el azul violeta.
2. **Agregar tokens semánticos** y registrarlos en `@theme inline`:
   `--success`, `--warning`, `--info` (más sus `-foreground` y una versión `-soft`
   para fondos de badge). `--destructive` ya existe.
3. Un `components/admin/estado-badge.tsx` con variantes `ok | aviso | peligro | info | neutro`,
   que reemplaza las combinaciones a mano de "pagado", "vencido", "stock bajo",
   "caja abierta", "turno confirmado/cancelado".
4. Icono activo del sidebar: `text-sidebar-primary` en vez de `text-emerald-600`.

**Riesgo:** medio. Cambia el color de todo el panel a la vez. Mitigación: se revisan
capturas antes y después de cada pantalla, en claro y en oscuro, a 375px y a 1440px.

---

### Fase 4 — Pasar Clínica a tokens (riesgo medio, la más larga)

Reemplazar colores fijos por tokens **archivo por archivo, un commit por archivo**,
siguiendo una tabla de equivalencias fija:

| Antes | Después |
|------|---------|
| `bg-white dark:bg-slate-900` / `bg-slate-800` | `bg-card` |
| `bg-slate-50 dark:bg-slate-900` | `bg-muted/50` o `bg-background` |
| `text-slate-900 dark:text-slate-100` | `text-foreground` |
| `text-slate-500/600 dark:text-slate-400` | `text-muted-foreground` |
| `border-slate-200 dark:border-slate-700` | `border-border` |
| `bg-emerald-600 hover:bg-emerald-700` | `bg-primary hover:bg-primary/90` (o directamente `<Button>`) |
| `text-emerald-600 dark:text-emerald-400` | `text-primary` |
| `bg-emerald-50 dark:bg-emerald-950` | `bg-accent` |

Orden, de más chico a más grande, para aprender con los fáciles:
`BlockDateModal` → `EditTurnoModal` → `StatsCard` → `calendar-view` → `timeline-view` →
`grid-view` → `turnos-management` → `TurnoDetailsModal` → `LibretaDetallesModal` →
`dashboard-charts` → `historias-management` → `clientes-management` →
`libreta-sanitaria-management` (al final, y en varias tandas).

Regla: **solo se cambian valores de `className`**. Si en un archivo aparece la tentación
de mover lógica o "ya que estoy" partir el componente, se anota y va aparte.

---

### Fase 5 — Jerarquía y tipografía (riesgo bajo, mucho impacto visual)

1. Un **encabezado de página único**, `components/admin/encabezado-pagina.tsx`:
   título, subtítulo de una línea, `<Ayuda>` opcional y slot de acciones a la derecha.
   Se usa en las 12 pantallas. Así se terminan los 4 tamaños distintos de `h1`.
2. Títulos de página en **Fraunces** (`font-display`), que ya se carga y le da al panel
   la misma voz que la landing ("Warm Trust"). El cuerpo y las tablas siguen en DM Sans.
3. Números importantes (totales de caja, saldo de Cta Cte, total del carrito) con
   `tabular-nums` y un tamaño más grande que el resto, para que se lean de un vistazo.
4. Skeletons parecidos a la forma real del contenido en Turnos, Caja, Ventas y Dashboard,
   en lugar del spinner centrado.

---

## 3. Fuera de alcance (a propósito)

- Refactorizar `libreta-sanitaria-management.tsx` en archivos más chicos: hace falta,
  pero es un cambio de estructura y no de estilo. Va en un plan propio y con tests.
- Rediseñar flujos (cambiar pasos del POS, mover campos de lugar).
- Cualquier cosa de la base de datos.
- Landing y página pública de cada veterinaria.

---

## 4. Cómo se verifica cada fase

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` y `npm test` en verde
- [ ] `git status`: solo los archivos de la fase
- [ ] Capturas antes y después a 375px y 1440px, en claro y en oscuro
- [ ] Recorrido con teclado: los `<Ayuda>` abren con Enter o Espacio y cierran con Esc
- [ ] En el celular: los `<Ayuda>` abren con tap y no tapan el botón de guardar
- [ ] Probado solo en el tenant de prueba; en los reales, navegar sin escribir

## 5. Estimación

| Fase | Tamaño | Se puede subir sola |
|------|--------|---------------------|
| 1 — Ayuda, tours y vacíos | 1–2 días | Sí |
| 2 — Arreglos rápidos | medio día | Sí |
| 3 — Tokens | 1 día | Sí |
| 4 — Clínica a tokens | 2–3 días | Sí, de a archivo |
| 5 — Jerarquía | 1 día | Sí |
