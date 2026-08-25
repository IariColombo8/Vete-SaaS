# Importar alimentos con marca/kilos detectados + pago por monto en el POS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al importar la lista de precios de alimentos, la marca (columna C del Excel) y el kilaje de la bolsa (extraído de la descripción) quedan guardados en cada producto; y en el punto de venta, para productos que se venden sueltos por kg, el vendedor puede tipear un monto en pesos y el sistema calcula el peso equivalente en vez de tener que calcularlo a mano.

**Architecture:** Todo el parseo del Excel sigue corriendo en el navegador (`lib/productos/importar.ts`, puro y testeado); se agregan dos funciones nuevas (`limpiarMarca`, `detectarPesoKg`) y se conectan en `parsearFilas`. La función SQL `importar_productos` (que hoy recibe `marca` pero nunca la graba) se reemplaza vía una migración nueva para persistir `marca`, `unidad` y `peso_kg`. En el POS, `CantidadDialog` gana un tercer modo de ingreso ("$") que es pura conversión numérica antes de llamar a `onConfirmar(cantidad)` — el carrito (`lib/ventas/carrito.ts`) no se entera de cómo se calculó la cantidad.

**Tech Stack:** Next.js 16 + React 19, TypeScript, Supabase (Postgres + RPC en plpgsql), Vitest para tests de `lib/`, xlsx-js-style para leer el Excel en el cliente.

---

## Task 1: `limpiarMarca` — limpiar el proveedor/marca del Excel

**Files:**
- Modify: `lib/productos/importar.ts`
- Test: `lib/productos/importar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `lib/productos/importar.test.ts` (fuera del `describe("parsearFilas", ...)` existente, como un nuevo `describe`):

```typescript
import { limpiarMarca } from "./importar"

describe("limpiarMarca", () => {
  it("quita el asterisco final y los espacios", () => {
    expect(limpiarMarca("APM FOOD *")).toBe("APM FOOD")
    expect(limpiarMarca("GARAY S.R.L *")).toBe("GARAY S.R.L")
  })

  it("no toca una marca sin asterisco", () => {
    expect(limpiarMarca("AUKI")).toBe("AUKI")
    expect(limpiarMarca("Bagó")).toBe("Bagó")
  })

  it("recorta espacios sueltos aunque no haya asterisco", () => {
    expect(limpiarMarca("  GOLOCAN  ")).toBe("GOLOCAN")
  })

  it("devuelve string vacío si no hay marca", () => {
    expect(limpiarMarca("")).toBe("")
    expect(limpiarMarca("   ")).toBe("")
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: FAIL — `limpiarMarca` no existe (`SyntaxError` o `is not a function`).

- [ ] **Step 3: Implementar `limpiarMarca`**

En `lib/productos/importar.ts`, agregar esta función antes de `parsearFilas` (después de `aNumero`, que termina en la línea 108 del archivo actual):

```typescript
/**
 * El Excel del proveedor trae la marca/distribuidor con un asterisco colgado
 * al final ("APM FOOD *", "GARAY S.R.L *"): es un artefacto de cómo exportan
 * la lista, no parte del nombre.
 */
export function limpiarMarca(texto: string): string {
  return texto.trim().replace(/\s*\*\s*$/, "").trim()
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: PASS (todos los tests, incluidos los de `parsearFilas` que ya existían).

- [ ] **Step 5: Commit**

```bash
git add lib/productos/importar.ts lib/productos/importar.test.ts
git commit -m "feat: limpiar asterisco final de la marca al importar productos"
```

---

## Task 2: `detectarPesoKg` — extraer el kilaje de la descripción

**Files:**
- Modify: `lib/productos/importar.ts`
- Test: `lib/productos/importar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/productos/importar.test.ts`:

```typescript
import { detectarPesoKg } from "./importar"

describe("detectarPesoKg", () => {
  it("detecta kilos enteros", () => {
    expect(detectarPesoKg("HANDLER GATOS ADULTOS X 10 KG HANDLER")).toBe(10)
    expect(detectarPesoKg("MONTAÑES PERROS ADULTOS X 20 KG MONTAÑES")).toBe(20)
  })

  it("convierte gramos a kilos", () => {
    expect(detectarPesoKg("BISCUITS DE POLLO HORNEADOS X 120 GR ")).toBe(0.12)
    expect(detectarPesoKg("AUKI BOCADITOS CAJA DOYPACKS 9 UNID X 500 GRS")).toBe(0.5)
  })

  it("acepta GR con punto final", () => {
    expect(detectarPesoKg("BOCADITOS FINOS X 100 GR. CARNE/POLLO/CHOCOLATE")).toBe(0.1)
  })

  it("usa la última coincidencia si el patrón aparece más de una vez", () => {
    expect(detectarPesoKg("ARGENTO PERRO ADULTO MORDIDA PEQ. X 15 KG ARGENTO X 1 KG")).toBe(1)
  })

  it("devuelve undefined si no hay patrón de peso", () => {
    expect(detectarPesoKg("Amoxidal 500mg")).toBeUndefined()
    expect(detectarPesoKg("Correa de cuero")).toBeUndefined()
    expect(detectarPesoKg("")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: FAIL — `detectarPesoKg` no existe.

- [ ] **Step 3: Implementar `detectarPesoKg`**

En `lib/productos/importar.ts`, agregar debajo de `limpiarMarca`:

```typescript
/**
 * Casi toda descripción de alimento trae el peso de la bolsa como
 * "X 10 KG" o "X 500 GRS" (a veces con punto: "X 100 GR."). Cuando la marca
 * se repite al final de la descripción puede aparecer más de una vez el
 * patrón "X ... KG" — se toma la última, que es la que describe la
 * presentación real (la primera repetición suele ser ruido del nombre).
 *
 * Devuelve el peso siempre en kilos (los gramos se dividen por 1000), o
 * `undefined` si la descripción no trae ningún patrón reconocible.
 */
export function detectarPesoKg(descripcion: string): number | undefined {
  const coincidencias = [...descripcion.matchAll(/X\s*([\d.,]+)\s*(KGS?|GRS?)\.?\b/gi)]
  if (coincidencias.length === 0) return undefined

  const [, numero, unidad] = coincidencias[coincidencias.length - 1]
  const valor = Number(numero.replace(",", "."))
  if (!Number.isFinite(valor) || valor <= 0) return undefined

  const enKg = /^KGS?$/i.test(unidad) ? valor : valor / 1000
  return Math.round(enKg * 1000) / 1000
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/productos/importar.ts lib/productos/importar.test.ts
git commit -m "feat: detectar el peso en kg desde la descripción al importar alimentos"
```

---

## Task 3: Conectar marca limpia + peso detectado en `parsearFilas`

**Files:**
- Modify: `lib/productos/importar.ts`
- Modify: `lib/supabase/productos.ts`
- Test: `lib/productos/importar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/productos/importar.test.ts`, dentro del `describe("parsearFilas", ...)` existente (junto a los otros `it(...)`):

```typescript
  it("limpia la marca y detecta el peso en una fila de alimento", () => {
    const wb = workbookDeFilas([
      ["COD", "DESCRIP", "MARCA", "VETER"],
      ["12080105", "HANDLER GATOS ADULTOS  X 10 KG HANDLER ", "APM FOOD *", "$ 30,568.94"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      marca: "APM FOOD",
      unidad: "un",
      pesoKg: 10,
      advertencias: [],
      revisar: false,
    })
  })

  it("marca advertencia cuando un alimento no trae peso detectable", () => {
    const wb = workbookDeFilas([
      ["COD", "DESCRIP", "MARCA", "VETER"],
      ["9999", "Snack sin presentación clara", "AUKI", "1000"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas[0].pesoKg).toBeUndefined()
    expect(filas[0].advertencias).toContain("sin peso detectado")
  })

  it("no exige peso detectado fuera de la categoría Alimentos", () => {
    const wb = workbookDeFilas([
      ["COD", "DESCRIP", "MARCA", "VETER"],
      ["A001", "Amoxidal 500mg", "Bagó", "1250.50"],
    ])

    const filas = parsearFilas(wb, "Medicamentos", 2)

    expect(filas[0].pesoKg).toBeUndefined()
    expect(filas[0].advertencias).not.toContain("sin peso detectado")
  })
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: FAIL — `marca` todavía trae el `*`, y no existen `unidad`/`pesoKg` en el resultado.

- [ ] **Step 3: Actualizar el tipo `FilaImportacion`**

En `lib/supabase/productos.ts`, ubicar la interfaz `FilaImportacion` (alrededor de la línea 548) y agregar los dos campos nuevos:

```typescript
export interface FilaImportacion {
  barra: string
  codigo: string
  descripcion: string
  marca?: string
  /** "un" para bolsa cerrada, "kg" si se vende suelto. Detectado al importar. */
  unidad?: string
  /** Kilos de la bolsa, detectados de la descripción. Solo tiene sentido con unidad "un". */
  pesoKg?: number
  categoria: string
  precio: number
  costo?: number
  rubro: string
  subrubro: string
  stock: number
  bulto?: number
  revisar: boolean
}
```

- [ ] **Step 4: Conectar las funciones en `parsearFilas`**

En `lib/productos/importar.ts`, dentro de `parsearFilas` (el `forEach`), reemplazar:

```typescript
    const codigo = leer(0)
    const descripcion = leer(1)
    const marca = leer(2)
    const costo = aNumero(leer(3))

    if (!descripcion && !codigo) return

    const advertencias: string[] = []
    if (!descripcion) advertencias.push("sin descripción")
    if (costo <= 0) advertencias.push("precio en cero")
    if (!codigo) advertencias.push("sin código")

    resultado.push({
      numeroFila: filaInicio + i,
      barra: "",
      codigo,
      descripcion,
      marca,
      categoria,
      precio: costo,
      costo,
      rubro: "",
      subrubro: "",
      stock: 0,
      revisar: advertencias.length > 0,
      advertencias,
    })
```

por:

```typescript
    const codigo = leer(0)
    const descripcion = leer(1)
    const marca = limpiarMarca(leer(2))
    const costo = aNumero(leer(3))

    if (!descripcion && !codigo) return

    const pesoKg = detectarPesoKg(descripcion)

    const advertencias: string[] = []
    if (!descripcion) advertencias.push("sin descripción")
    if (costo <= 0) advertencias.push("precio en cero")
    if (!codigo) advertencias.push("sin código")
    if (categoria === "Alimentos" && pesoKg === undefined) {
      advertencias.push("sin peso detectado")
    }

    resultado.push({
      numeroFila: filaInicio + i,
      barra: "",
      codigo,
      descripcion,
      marca,
      unidad: "un",
      pesoKg,
      categoria,
      precio: costo,
      costo,
      rubro: "",
      subrubro: "",
      stock: 0,
      revisar: advertencias.length > 0,
      advertencias,
    })
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: PASS (todos los tests del archivo, incluidos Task 1 y Task 2).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/productos/importar.ts lib/supabase/productos.ts lib/productos/importar.test.ts
git commit -m "feat: guardar marca limpia, unidad y peso detectado al parsear la importación"
```

---

## Task 4: Migración SQL — persistir `marca`, `unidad` y `peso_kg` en `importar_productos`

**Files:**
- Create: `supabase/006_import_marca_peso.sql`

Este archivo se ejecuta a mano en el SQL Editor de Supabase (mismo flujo que
`004_productos.sql` y `005_ventas.sql`, según `CLAUDE.md`). No hay test
automatizado para plpgsql en este proyecto — la verificación es manual en el
Task 6.

- [ ] **Step 1: Crear la migración**

Crear `supabase/006_import_marca_peso.sql` con el siguiente contenido completo
(reemplaza la función completa; es la misma lógica de
`004_productos.sql` con `marca`, `unidad` y `peso_kg` agregados):

```sql
-- ============================================================================
-- 006_import_marca_peso.sql
-- Extiende importar_productos para persistir marca, unidad y peso_kg.
--
-- Hasta ahora el importador del navegador (lib/productos/importar.ts) ya
-- mandaba `marca` en cada fila, pero la función nunca la guardaba; y no
-- existía forma de mandar `unidad`/`peso_kg` desde una importación masiva
-- (solo cargando el producto a mano). Esto lo corrige sin tocar la firma de
-- la función: los campos nuevos son opcionales dentro de cada fila del jsonb.
-- ============================================================================

create or replace function public.importar_productos(
  p_tenant_id  text,
  p_filas      jsonb,
  p_estrategia text default 'no_tocar'
) returns jsonb
language plpgsql
as $$
declare
  v_fila           jsonb;
  v_barra          text;
  v_codigo         text;
  v_nombre         text;
  v_marca          text;
  v_unidad         text;
  v_peso_kg        numeric;
  v_categoria      text;
  v_precio         numeric;
  v_costo          numeric;
  v_stock          numeric;
  v_bulto          integer;
  v_revisar        boolean;
  v_existente      public.productos%rowtype;
  v_stock_final    numeric;
  v_creados        integer := 0;
  v_actualizados   integer := 0;
  v_omitidos       integer := 0;
  v_con_warnings   integer := 0;
  v_errores        integer := 0;
  v_primer_error   text;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'Sin permisos sobre la veterinaria %', p_tenant_id;
  end if;
  if p_estrategia not in ('no_tocar', 'reemplazar', 'sumar', 'solo_nuevos') then
    raise exception 'Estrategia de stock inválida: %', p_estrategia;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb))
  loop
    v_barra    := nullif(trim(coalesce(v_fila->>'barra',       '')), '');
    v_codigo   := nullif(trim(coalesce(v_fila->>'codigo',      '')), '');
    v_nombre   := nullif(trim(coalesce(v_fila->>'descripcion', '')), '');
    v_marca    := nullif(trim(coalesce(v_fila->>'marca',       '')), '');
    v_unidad   := nullif(trim(coalesce(v_fila->>'unidad',      '')), '');
    v_peso_kg  := nullif(v_fila->>'pesoKg', '')::numeric;
    v_precio   := coalesce((v_fila->>'precio')::numeric, 0);
    v_costo    := nullif(v_fila->>'costo', '')::numeric;
    v_stock    := coalesce((v_fila->>'stock')::numeric, 0);
    v_bulto    := nullif(v_fila->>'bulto', '')::integer;
    v_revisar  := coalesce((v_fila->>'revisar')::boolean, false);

    v_categoria := trim(concat_ws(
      ' / ',
      nullif(trim(coalesce(v_fila->>'rubro',    '')), ''),
      nullif(trim(coalesce(v_fila->>'subrubro', '')), '')
    ));

    -- Una fila sin nombre y sin ningún código no se puede identificar ni mostrar.
    if v_nombre is null and v_barra is null and v_codigo is null then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;
    if v_revisar then
      v_con_warnings := v_con_warnings + 1;
    end if;

    -- Cada fila va en su propio sub-bloque: una que choque (por ejemplo, un
    -- código repetido dentro del mismo Excel) se cuenta como error y se sigue,
    -- en vez de tirar abajo el lote entero de 200.
    begin
      -- Buscar por código de barras primero, después por código interno.
      select * into v_existente from public.productos
        where tenant_id = p_tenant_id and v_barra is not null and codigo_barras = v_barra
        limit 1;
      if not found and v_codigo is not null then
        select * into v_existente from public.productos
          where tenant_id = p_tenant_id and codigo = v_codigo
          limit 1;
      end if;

      if found then
        if p_estrategia = 'solo_nuevos' then
          v_omitidos := v_omitidos + 1;
          continue;
        end if;

        v_stock_final := case p_estrategia
          when 'reemplazar' then v_stock
          when 'sumar'      then v_existente.stock + v_stock
          else                   v_existente.stock
        end;

        update public.productos set
          nombre             = coalesce(v_nombre, v_existente.nombre),
          -- Un precio en 0 en el Excel casi siempre es una celda vacía, no una
          -- decisión de regalar el producto: se conserva el precio anterior.
          precio             = case when v_precio > 0 then v_precio else v_existente.precio end,
          costo              = coalesce(v_costo, v_existente.costo),
          categoria          = coalesce(nullif(v_categoria, ''), v_existente.categoria),
          codigo             = coalesce(v_codigo, v_existente.codigo),
          codigo_barras      = coalesce(v_barra,  v_existente.codigo_barras),
          stock              = greatest(v_stock_final, 0),
          unidades_por_bulto = coalesce(v_bulto, v_existente.unidades_por_bulto),
          marca              = coalesce(v_marca, v_existente.marca),
          unidad             = coalesce(v_unidad, v_existente.unidad),
          peso_kg            = coalesce(v_peso_kg, v_existente.peso_kg),
          revisar            = v_revisar
        where id = v_existente.id;

        v_actualizados := v_actualizados + 1;
      else
        insert into public.productos
          (tenant_id, codigo, codigo_barras, nombre, categoria, precio, costo,
           stock, unidades_por_bulto, marca, unidad, peso_kg, revisar)
        values
          (p_tenant_id, v_codigo, v_barra, coalesce(v_nombre, coalesce(v_barra, v_codigo)),
           v_categoria, greatest(v_precio, 0), v_costo,
           greatest(v_stock, 0), v_bulto, v_marca, coalesce(v_unidad, 'un'), v_peso_kg, v_revisar);

        v_creados := v_creados + 1;
      end if;
    exception when others then
      v_errores := v_errores + 1;
      if v_primer_error is null then
        v_primer_error := coalesce(v_nombre, v_barra, v_codigo) || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'creados',         v_creados,
    'actualizados',    v_actualizados,
    'omitidos',        v_omitidos + v_errores,
    'conAdvertencias', v_con_warnings,
    'errores',         v_errores,
    'primerError',     v_primer_error
  );
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/006_import_marca_peso.sql
git commit -m "feat: persistir marca, unidad y peso_kg en importar_productos"
```

- [ ] **Step 3: Avisar al usuario**

Este archivo SQL no se ejecuta solo — hay que decírselo al usuario explícitamente
al terminar el plan: tiene que copiar `supabase/006_import_marca_peso.sql` y
correrlo en el SQL Editor de su proyecto de Supabase antes de importar el Excel,
igual que hizo con `004_productos.sql`.

---

## Task 5: Modo de ingreso "$" en `CantidadDialog`

**Files:**
- Modify: `components/admin/pos/cantidad-dialog.tsx`

No hay test automatizado para este archivo (es un componente de UI sin lógica
extraída a `lib/`, y el proyecto verifica cambios de UI manualmente en el
navegador — ver Task 6). El cálculo en sí es aritmética simple ya cubierta por
`precioFinal`/`precioLinea`, que sí están testeados en `lib/productos/precios.ts`.

- [ ] **Step 1: Ampliar el tipo de modo de ingreso**

En `components/admin/pos/cantidad-dialog.tsx`, reemplazar:

```typescript
type UnidadIngreso = "kg" | "g"
```

por:

```typescript
type UnidadIngreso = "kg" | "g" | "$"
```

- [ ] **Step 2: Agregar el import de `precioFinal`**

Reemplazar la línea de import existente:

```typescript
import { precioLinea } from "@/lib/productos/precios"
```

por:

```typescript
import { precioFinal, precioLinea } from "@/lib/productos/precios"
```

- [ ] **Step 3: Agregar los montos rápidos**

Debajo de la constante existente `GRAMOS_RAPIDOS` (línea 25), agregar:

```typescript
/** Atajos de montos: los pedidos típicos cuando el cliente pide "$1000 de alimento". */
const MONTOS_RAPIDOS = [500, 1000, 1500, 2000, 3000, 5000]
```

- [ ] **Step 4: Calcular la cantidad en modo "$"**

Reemplazar el cálculo de `cantidad` existente:

```typescript
  const cantidad = useMemo(() => {
    const n = Number(valor.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) return 0
    return unidadIngreso === "g" ? n / 1000 : n
  }, [valor, unidadIngreso])
```

por:

```typescript
  const cantidad = useMemo(() => {
    const n = Number(valor.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) return 0
    if (unidadIngreso === "g") return n / 1000
    if (unidadIngreso === "$") {
      const precio = producto ? precioFinal(producto) : 0
      return precio > 0 ? n / precio : 0
    }
    return n
  }, [valor, unidadIngreso, producto])
```

- [ ] **Step 5: Agregar el tercer botón de modo**

Reemplazar el bloque del toggle de modo (dentro del `{porKg && (...)}` que
arma los botones "Kilos"/"Elegir peso (g)"):

```typescript
                {porKg && (
                  <div className="flex gap-0.5 rounded-md border bg-background p-0.5">
                    {(["kg", "g"] as const).map((u) => (
                      <Button
                        key={u}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${
                          unidadIngreso === u ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" : ""
                        }`}
                        onClick={() => {
                          setUnidadIngreso(u)
                          setValor("")
                        }}
                      >
                        {u === "kg" ? "Kilos" : "Elegir peso (g)"}
                      </Button>
                    ))}
                  </div>
                )}
```

por:

```typescript
                {porKg && (
                  <div className="flex gap-0.5 rounded-md border bg-background p-0.5">
                    {(["kg", "g", "$"] as const).map((u) => (
                      <Button
                        key={u}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${
                          unidadIngreso === u ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" : ""
                        }`}
                        onClick={() => {
                          setUnidadIngreso(u)
                          setValor("")
                        }}
                      >
                        {u === "kg" ? "Kilos" : u === "g" ? "Elegir peso (g)" : "Por monto ($)"}
                      </Button>
                    ))}
                  </div>
                )}
```

- [ ] **Step 6: Actualizar la etiqueta del campo y el placeholder**

Reemplazar:

```typescript
                <Label htmlFor="cantidad">
                  {porKg ? (unidadIngreso === "g" ? "Peso" : "Kilos") : "Unidades"}
                </Label>
```

por:

```typescript
                <Label htmlFor="cantidad">
                  {porKg
                    ? unidadIngreso === "g"
                      ? "Peso"
                      : unidadIngreso === "$"
                        ? "Monto"
                        : "Kilos"
                    : "Unidades"}
                </Label>
```

Reemplazar los atributos del `<Input>` de cantidad:

```typescript
              <Input
                id="cantidad"
                type="number"
                inputMode="decimal"
                min={porKg ? (unidadIngreso === "g" ? 1 : 0.001) : 1}
                step={porKg ? (unidadIngreso === "g" ? 10 : 0.1) : 1}
                value={valor}
                autoFocus
                placeholder={porKg ? (unidadIngreso === "g" ? "Ej: 200" : "Ej: 2,5") : "1"}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar()
                }}
                className="h-12 text-lg"
              />
```

por:

```typescript
              <Input
                id="cantidad"
                type="number"
                inputMode="decimal"
                min={porKg ? (unidadIngreso === "g" ? 1 : unidadIngreso === "$" ? 1 : 0.001) : 1}
                step={porKg ? (unidadIngreso === "g" ? 10 : unidadIngreso === "$" ? 100 : 0.1) : 1}
                value={valor}
                autoFocus
                placeholder={
                  porKg
                    ? unidadIngreso === "g"
                      ? "Ej: 200"
                      : unidadIngreso === "$"
                        ? "Ej: 1000"
                        : "Ej: 2,5"
                    : "1"
                }
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar()
                }}
                className="h-12 text-lg"
              />
```

- [ ] **Step 7: Mostrar los atajos rápidos según el modo**

Reemplazar:

```typescript
            {porKg && (
              <div className="flex flex-wrap gap-1.5">
                {(unidadIngreso === "g" ? GRAMOS_RAPIDOS : KILOS_RAPIDOS).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValor(String(n))}
                  >
                    {unidadIngreso === "g" ? `${n} g` : `${formatCantidad(n)} kg`}
                  </Button>
                ))}
              </div>
            )}
```

por:

```typescript
            {porKg && (
              <div className="flex flex-wrap gap-1.5">
                {(unidadIngreso === "g"
                  ? GRAMOS_RAPIDOS
                  : unidadIngreso === "$"
                    ? MONTOS_RAPIDOS
                    : KILOS_RAPIDOS
                ).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValor(String(n))}
                  >
                    {unidadIngreso === "g"
                      ? `${n} g`
                      : unidadIngreso === "$"
                        ? formatCurrency(n)
                        : `${formatCantidad(n)} kg`}
                  </Button>
                ))}
              </div>
            )}
```

- [ ] **Step 8: Mostrar el peso equivalente cuando el modo es "$"**

Reemplazar el bloque del importe:

```typescript
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Importe</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(importe)}
                </span>
              </div>
              {producto.controlaStock && (
                <p
                  className={`mt-1 text-xs ${excedeStock ? "font-medium text-red-600" : "text-muted-foreground"}`}
                >
                  {excedeStock
                    ? `Solo quedan ${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`
                    : `Stock: ${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`}
                </p>
              )}
            </div>
```

por:

```typescript
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Importe</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(importe)}
                </span>
              </div>
              {unidadIngreso === "$" && cantidad > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ≈ {cantidad < 1 ? `${formatCantidad(cantidad * 1000)} g` : `${formatCantidad(cantidad)} kg`}
                </p>
              )}
              {producto.controlaStock && (
                <p
                  className={`mt-1 text-xs ${excedeStock ? "font-medium text-red-600" : "text-muted-foreground"}`}
                >
                  {excedeStock
                    ? `Solo quedan ${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`
                    : `Stock: ${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`}
                </p>
              )}
            </div>
```

- [ ] **Step 9: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add components/admin/pos/cantidad-dialog.tsx
git commit -m "feat: permitir cargar la cantidad por monto en pesos en el POS"
```

---

## Task 6: Verificación manual en el navegador

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el servidor de desarrollo**

Run: `npm run dev`

- [ ] **Step 2: Correr la migración SQL pendiente**

Antes de probar la importación: copiar el contenido de
`supabase/006_import_marca_peso.sql` y ejecutarlo en el SQL Editor del
proyecto de Supabase (Dashboard → SQL Editor → pegar → Run).

- [ ] **Step 3: Probar la importación del Excel real**

En el navegador: ir a `/{slug}/productos` → botón de importar → categoría
"Alimentos" → subir `FABIAN ALIMMENTOS 2807.xlsx` → avanzar a la pantalla de
revisión.

Verificar:
- Las filas con patrón "X ... KG/GR" no aparecen en "Productos a revisar" por
  falta de peso (deberían ser la gran mayoría de las 552 filas).
- Alguna fila sin patrón reconocible (si existe) aparece con la advertencia
  "sin peso detectado".
- Confirmar la importación y chequear en la lista de Productos que, para un
  par de productos importados, los campos "Marca" y el kilaje (editable desde
  el diálogo de producto) quedaron cargados.

- [ ] **Step 4: Probar el selector de alimentos del POS**

Ir a `/{slug}/pos` → abrir el selector de alimentos → confirmar que ahora
aparecen las marcas reales del Excel (HANDLER, ARGENTO, GOLOCAN, BOQUITA,
etc.) agrupando sus presentaciones por kilaje.

- [ ] **Step 5: Probar el modo "$" en un producto vendido por kg**

Necesita un producto existente con `unidad = "kg"` (alimento suelto). Si no
hay ninguno cargado, crear uno de prueba desde Productos con esa unidad y un
precio por kg conocido (por ejemplo $5000/kg).

En el POS: agregar ese producto al carrito → se abre `CantidadDialog` → tocar
el botón "Por monto ($)" → tipear `1000` → verificar que:
- El importe mostrado es exactamente $1000 (o el más cercano por redondeo).
- El texto "≈ ..." muestra el peso equivalente correcto (para $5000/kg y
  $1000, debería mostrar "≈ 200 g").
- Al confirmar, la línea del carrito muestra la cantidad en kg correcta
  (0,2 kg en el ejemplo).

- [ ] **Step 6: Confirmar que no se rompió nada existente**

Run: `npx vitest run`
Expected: todos los tests pasan (los nuevos de Task 1-3 y los que ya existían).

Run: `npm run build`
Expected: build de producción sin errores.
