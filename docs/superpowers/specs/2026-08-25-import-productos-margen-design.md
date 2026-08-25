# Import de productos por categoría fija + margen de ganancia

Fecha: 2026-08-25
Alcance: VipVet (módulo Productos, plan Plus/Pro)

## Contexto

Hoy `import-dialog.tsx` importa un Excel genérico: el usuario mapea manualmente
qué columna corresponde a cada campo (código, descripción, precio, costo,
rubro, subrubro, stock, bulto, código de barras), con detección automática por
regex y mapeo recordado por tenant en `localStorage`.

En la práctica el proveedor de VipVet entrega **tres listas separadas** con
formato fijo: `Medicamentos.xlsx`, `Alimentos.xlsx`, `Accesorios.xlsx`. Cada
una trae siempre las mismas 4 columnas, sin variación:

| Columna | Campo |
|---------|-------|
| A | Código |
| B | Descripción |
| C | Marca |
| D | Precio (es el **costo**, no el precio de venta) |

No hay código de barras en el Excel — se carga a mano por producto cuando
corresponda. No hay rubro/subrubro/stock/bulto en estas listas.

Separado del import, se necesita una forma de aplicar un % de ganancia sobre
el costo para fijar el precio de venta, sin tener que editar producto por
producto.

## Decisiones tomadas en brainstorming

- El precio de la columna D es **costo**, no precio de venta.
- El código de barras no se importa: se completa después, manualmente, en la
  ficha del producto (`producto-dialog.tsx`), si el producto lo tiene.
- El % de ganancia es una **herramienta aparte**, no un paso del wizard de
  import. Se puede aplicar en cualquier momento, no solo justo después de
  importar.
- El % de ganancia por producto específico se define por **selección
  múltiple** en el listado de productos (checkboxes + aplicar en lote), no
  editando un campo individual en la ficha del producto.
- Al importar, el precio de venta se inicializa **igual al costo**
  (`precio = costo`). Es intencionalmente "incorrecto" hasta que se aplique un
  margen — así un producto recién importado sin margen aplicado no queda con
  precio en $0 (que rompería el POS) pero tampoco parece un precio real ya
  cargado.
- El cálculo del margen siempre parte del **costo actual guardado**, nunca del
  precio de venta actual: `precio = costo × (1 + porcentaje / 100)`. Reaplicar
  el mismo % dos veces dev vuelve al mismo resultado (no es acumulativo).

## Parte 1 — Import por categoría fija

### Flujo del wizard (`components/admin/productos/import-dialog.tsx`)

Nuevo paso 0, antes de "archivo":

1. **Categoría** — tres botones/opciones: Medicamentos, Alimentos, Accesorios.
   Selecciona el valor que va a la columna `categoria` de todas las filas de
   ese archivo. Obligatorio para continuar.
2. **Archivo** — igual que hoy (drag/click para elegir `.xlsx`/`.xls`), pero
   **sin la sección de mapeo de columnas**. El único control que queda es
   "fila donde empiezan los datos" (por si el proveedor agrega una fila de
   título), default 2.
3. **Revisión** — igual que hoy: stats, filas con advertencias, estrategia de
   stock. La estrategia de stock sigue teniendo sentido porque el import no
   trae stock, así que "no tocar" será la opción relevante casi siempre (se
   mantiene el selector completo por si el usuario carga stock a mano antes).
4. **Progreso / Resultado** — sin cambios.

Los pasos pasan a ser: `categoria → archivo → revision → progreso → resultado`.

### Parseo (`lib/productos/importar.ts`)

- Se elimina: `CampoImport`, `ETIQUETAS_CAMPO`, `MapeoColumnas`,
  `PATRONES`, `adivinarMapeo`, `cargarMapeoGuardado`, `guardarMapeo`,
  `ConfigImport`, y el parámetro `mapeo` de `parsearFilas`.
- Nueva función `parsearFilas(workbook, categoria, filaInicio)` que lee
  columnas fijas por índice (A=0 código, B=1 descripción, C=2 marca, D=3
  costo):

```ts
export function parsearFilas(
  workbook: XLSX.WorkBook,
  categoria: string,
  filaInicio: number,
): FilaParseada[]
```

- Reglas de advertencia (igual espíritu que hoy, adaptadas):
  - Fila vacía → se ignora (no cuenta como advertencia).
  - Sin descripción y sin código → se descarta la fila (subtotal/separador).
  - `costo <= 0` → advertencia "precio en cero".
  - Sin código → advertencia "sin código" (ya no hay código de barras como
    alternativa).
  - Sin marca → **no** es advertencia (es opcional, no todos los productos
    tienen marca, ej. accesorios genéricos).
- Cada fila parseada arma:
  `{ codigo, descripcion, marca, categoria, costo, precio: costo, barra: "", stock: 0 }`
  reutilizando la interfaz `FilaImportacion` existente (campos que esa
  interfaz ya tenía como opcionales — `rubro`/`subrubro`/`bulto` quedan
  `undefined`, no se envían).
- `leerArchivo` no cambia (sigue devolviendo la vista previa cruda del
  workbook, usada solo para mostrar el conteo de filas y muestras en la UI de
  revisión, ya no para elegir columnas).
- Se elimina el helper `indiceALetra`/`letraAIndice` si queda sin uso fuera de
  este archivo (verificar en implementación).

### Componente (`import-dialog.tsx`)

- Nuevo estado `categoria: "Medicamentos" | "Alimentos" | "Accesorios" | null`.
- Paso `"categoria"` como primer paso del wizard, con 3 botones estilo los que
  ya existen para "estrategia de stock" (mismo patrón visual `cn(...)` de
  seleccionado/no seleccionado).
- Se elimina todo el bloque de selects de mapeo, `muestraDe`, `CAMPOS`,
  `mapeoCompleto`, `columnas`/`filasMuestra` usados para el selector (la vista
  previa de filas puede simplificarse a solo mostrar el conteo, ya no hace
  falta mostrar "muestra por columna").
- `irARevision()` pasa a llamar `parsearFilas(workbook, categoria, filaInicio)`.
- El `reiniciar()` también resetea `categoria`.

### Fuera de alcance de esta parte

- No se toca `importarProductos` en `lib/supabase/productos.ts` ni la RPC
  `importar_productos` — siguen recibiendo `FilaImportacion[]` con la misma
  forma, solo que ahora las filas siempre traen `precio = costo` y sin
  `rubro`/`subrubro`/`bulto`/`barra`.
- No se toca `producto-dialog.tsx` (carga manual de código de barras ya existe
  ahí).

## Parte 2 — Aplicar % de ganancia

### Nuevo diálogo `components/admin/productos/margen-dialog.tsx`

Se abre desde un botón nuevo en la barra de acciones de
`productos-management.tsx` (al lado de "Importar"), texto **"Aplicar
ganancia"**. Tres modos, elegidos con tabs o radio-cards (mismo patrón visual
que "estrategia de stock" en el import):

1. **A todos** — aplica el % a todos los productos activos del tenant que
   tengan `costo` cargado (> 0).
2. **Por categoría** — select con las categorías existentes del tenant
   (reutiliza el mismo query que ya usa el filtro de categoría en el listado,
   `obtenerCategorias` o equivalente en `lib/supabase/productos.ts:282`).
   Aplica el % a los productos de esa categoría con `costo` cargado.
3. **A selección** — usa los productos actualmente tildados en el listado (ver
   sección siguiente). Si no hay ninguno seleccionado, el modo aparece
   deshabilitado con una nota.

Campo único: **% de ganancia** (número, puede tener decimales, ej. 35 o
42.5). Al confirmar:

- Se calcula `precio = costo * (1 + porcentaje / 100)`, redondeado a 2
  decimales.
- Se excluyen productos sin costo (`costo` null o 0) y se informa cuántos se
  omitieron por eso en el resultado ("Se aplicó a N productos. M se omitieron
  por no tener costo cargado.").
- Update por lotes (mismo `TAMANIO_LOTE = 200` que usa el import) llamando a
  una función nueva en `lib/supabase/productos.ts`:

```ts
export async function aplicarMargen(
  tenantId: string,
  porcentaje: number,
  alcance:
    | { tipo: "todos" }
    | { tipo: "categoria"; categoria: string }
    | { tipo: "seleccion"; ids: string[] },
): Promise<{ actualizados: number; omitidosSinCosto: number }>
```

Internamente: `select id, costo` filtrado por tenant + alcance + `costo >
0`, calcular precios en el cliente, y hacer `update` en lotes (igual patrón
que ya usa `importarProductos`, no requiere RPC nueva porque no es una
operación que necesite transacción atómica multi-tabla — es un `UPDATE`
directo sobre `precio`, campo que ya se edita directo desde
`actualizarProducto`).

### Selección múltiple en el listado (`productos-management.tsx`)

- Se agrega una columna de checkbox al principio de cada fila de la tabla de
  productos (y uno en el header para "seleccionar todos los visibles",
  respetando el filtro de categoría/búsqueda activo).
- Estado `seleccionados: Set<string>` (ids de producto) a nivel del
  componente de gestión.
- Cuando hay 1+ seleccionados, aparece una barra de acción contextual (o el
  botón "Aplicar ganancia" pasa a preseleccionar el modo "A selección").
- La selección se limpia al cerrar el diálogo de margen con éxito, y al
  cambiar de filtro de categoría (para evitar aplicar a productos que ya no
  se están viendo, aunque técnicamente los ids seleccionados seguirían siendo
  válidos — se limpia por claridad de UX, no por necesidad técnica).

## Testing

- `lib/productos/importar.ts`: tests existentes que cubren `parsearFilas`
  deben actualizarse al nuevo signature (columna fija en vez de mapeo). Casos
  a cubrir: fila sin código se descarta, costo en cero da advertencia,
  `precio` sale igual a `costo`, marca ausente no genera advertencia.
- Nueva función `aplicarMargen`: no tiene lógica pura fácil de aislar del
  cliente de Supabase (hace queries), así que el cálculo de precio
  (`costo * (1 + %/100)`, redondeo) se extrae a una función pura testeable en
  `lib/productos/precios.ts` (ya existe ese archivo para cálculos puros de
  precios/ofertas) — ej. `calcularPrecioConMargen(costo, porcentaje): number`.

## Fuera de alcance

- No se migra data existente (productos ya importados con el sistema viejo de
  mapeo no se tocan).
- No se guarda un "% de margen" persistente por producto/categoría — cada
  aplicación es un cálculo puntual sobre el costo en ese momento, no hay
  recálculo automático si el costo cambia después.
- No se modifica el RLS ni las policies de `productos` — el update de precio
  ya está permitido por las policies actuales (mismo camino que
  `actualizarProducto`).
