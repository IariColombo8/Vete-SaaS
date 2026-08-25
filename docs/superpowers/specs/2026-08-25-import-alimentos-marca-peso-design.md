# Importar alimentos con marca/kilos detectados + pago por monto en el POS

## Contexto

El usuario tiene una lista de precios de un proveedor ("FABIAN ALIMMENTOS 2807.xlsx",
552 filas) con columnas `COD | DESCRIP | MARCA | VETER(precio)`. Dos problemas:

1. La columna "MARCA" del Excel es en realidad el distribuidor (`APM FOOD *`,
   `GARAY S.R.L *`), no la marca del alimento — pero el usuario confirmó que
   quiere usar esa columna tal cual (limpiando el `*` final).
2. Casi toda descripción trae el peso de la bolsa ("HANDLER GATOS ADULTOS X 10 KG
   HANDLER", "BOCADITOS FINOS X 500 GR"), que hoy no se detecta ni se guarda:
   el importador ya lee la columna de marca a un campo `marca`, pero la función
   SQL `importar_productos` nunca la persiste, y no existe extracción de kilos.

El selector de alimentos del POS (`AlimentoSelector`) y el carrito
(`presentacionDe`) ya saben mostrar `marca`/`linea`/`pesoKg` — el bug es que
nunca llegan a guardarse desde una importación masiva, solo cargando el
producto a mano uno por uno.

Aparte, en el diálogo de cantidad del POS (`CantidadDialog`), para productos
que se venden sueltos por kg, el vendedor hoy puede tipear kilos o gramos, pero
no un monto en pesos. Pedido explícito: poder tipear "$1000 de alimento" y que
calcule los gramos/kilos correspondientes en vez de tener que hacer la cuenta
a mano.

Todo el parseo del Excel corre en el navegador (como ya hace `importar.ts`) y
el archivo original del usuario no se modifica ni se sube a ningún lado más
que las filas ya interpretadas.

## Parte 1 — Importación: marca limpia + peso detectado

### `lib/productos/importar.ts`

- **`limpiarMarca(texto: string): string`** — nueva función. Quita un `*`
  final (con espacios alrededor) y hace `trim()`. `"APM FOOD *"` →
  `"APM FOOD"`. Si no hay `*`, devuelve el texto tal cual (trimeado).

- **`detectarPesoKg(descripcion: string): number | undefined`** — nueva
  función. Busca en la descripción el patrón `X <número> (KG|KGS|GR|GRS)`
  (case-insensitive, con o sin punto final). Si hay más de una coincidencia
  (raro, pasa cuando la marca se repite al final), usa la **última**. Convierte
  gramos a kg dividiendo por 1000. Redondea a 3 decimales (mismo criterio que
  `stock` en la base). Devuelve `undefined` si no matchea nada.

  Regex propuesta: `/X\s*([\d.,]+)\s*(KGS?|GRS?)\.?\b/gi`, tomando el último
  match del array. El número se parsea con la misma lógica de `aNumero` ya
  existente (maneja coma/punto) pero simplificada porque acá siempre son
  enteros o con un decimal simple.

- **`parsearFilas`**: cambios en el cuerpo del `forEach`:
  - `marca = limpiarMarca(leer(2))` en vez de `leer(2)` crudo.
  - `pesoKg = detectarPesoKg(descripcion)`.
  - `unidad: "un"` fijo (bolsa cerrada) — coincide con la decisión ya tomada.
  - Si `categoria === "Alimentos"` y `pesoKg` es `undefined`, agregar advertencia
    `"sin peso detectado"` (no bloquea la fila, igual que las demás
    advertencias: se puede incluir igual y corregir el kilaje después a mano
    desde Productos).
  - Estos dos campos nuevos (`unidad`, `pesoKg`) se agregan siempre, no solo
    para "Alimentos" — no tiene efecto en Medicamentos/Accesorios porque
    `detectarPesoKg` no va a matchear nada en sus descripciones típicas.

- **`FilaParseada`** ya extiende `FilaImportacion`, así que hereda los campos
  nuevos sin cambios adicionales en ese tipo.

### `lib/supabase/productos.ts`

- `FilaImportacion`: agregar `unidad?: string` y `pesoKg?: number` (ya existe
  `marca?: string`).
- `ProductoInput`/mapeo de filas de la tabla no cambian — ya soportan estos
  campos para alta/edición manual.

### `supabase/006_import_marca_peso.sql` (migración nueva)

`create or replace function public.importar_productos(...)`: mismo cuerpo que
hoy, agregando:

- Lectura de `v_marca`, `v_unidad`, `v_peso_kg` desde `v_fila` (con
  `nullif(trim(...), '')` para marca/unidad y `nullif(...)::numeric` para
  peso_kg, mismo patrón que las columnas existentes).
- En el `insert`: agregar `marca`, `unidad`, `peso_kg` a la lista de columnas
  y valores (`coalesce(v_unidad, 'un')` para no dejar la columna nula).
- En el `update`: `marca = coalesce(v_marca, v_existente.marca)`,
  `unidad = coalesce(v_unidad, v_existente.unidad)`,
  `peso_kg = coalesce(v_peso_kg, v_existente.peso_kg)` — mismo criterio que el
  resto de los campos (no pisar con vacío lo que ya había).
- Se ejecuta a mano en el SQL Editor de Supabase, como los demás archivos
  numerados de `supabase/`.

### Fuera de alcance en esta parte

- No se toca `import-dialog.tsx` — la UI de revisión ya es genérica (lista
  advertencias por fila con `.join(", ")`), así que "sin peso detectado" va a
  aparecer ahí sin cambios de código.
- No se valida que la marca detectada sea "razonable" — se usa la columna C
  literal (limpia de `*`), como pidió el usuario.

## Parte 2 — Pago por monto en el POS

### `components/admin/pos/cantidad-dialog.tsx`

- `type UnidadIngreso = "kg" | "g" | "$"` (agrega `"$"` a lo existente).
- El toggle de dos botones ("Kilos" / "Elegir peso (g)") pasa a tener un
  tercer botón "Por monto ($)", visible solo cuando `porKg` (igual que ahora).
- Cálculo de `cantidad` (en kg, que es lo que espera el carrito):
  - `"kg"` → `n`
  - `"g"` → `n / 1000`
  - `"$"` → `n / precioFinal(producto)` (usa el precio ya con oferta aplicada,
    igual que se factura). Si `precioFinal(producto) <= 0`, cantidad = 0
    (mismo comportamiento que un valor inválido hoy).
- Atajos rápidos para modo `"$"`: `[500, 1000, 1500, 2000, 3000, 5000]`,
  mismo componente `Button` que ya se usa para `KILOS_RAPIDOS`/`GRAMOS_RAPIDOS`.
- Debajo del importe (que ya se muestra), agregar una línea con el peso
  equivalente cuando el modo es `"$"`: "≈ 245 g" si `cantidad < 1` kg, o
  "≈ 1,2 kg" si es mayor — mismo criterio de formato que ya usa
  `formatCantidad`.
- El resto del diálogo (validación de stock, botón Agregar, reset al abrir)
  no cambia: sigue operando sobre `cantidad` en kg sea cual sea el modo de
  ingreso.

### Fuera de alcance en esta parte

- No se toca `agregarAlCarrito` ni `lib/ventas/carrito.ts` — reciben `cantidad`
  en kg como siempre, sin saber cómo se calculó.
- No se persiste "modo de ingreso preferido" del vendedor; cada apertura del
  diálogo arranca en "Kilos", como hoy.

## Testing

- `lib/productos/importar.ts` ya tiene tests (asumido por el patrón del
  proyecto de testear `lib/` puro). Agregar casos para `detectarPesoKg` y
  `limpiarMarca` con ejemplos reales del Excel del usuario (incluidos los
  casos límite: "X 500 GRS", "X 100 GR.", sin patrón "X ... KG/GR", marca sin
  asterisco).
- `lib/ventas/carrito.ts` no cambia — sin tests nuevos ahí.
- El cálculo de cantidad en modo `"$"` de `CantidadDialog` es lógica de
  componente (no vive en un módulo puro); se verifica manualmente en el
  navegador como indica el flujo de trabajo del proyecto para cambios de UI.
