# Plan de automatización del SaaS

Objetivo: que una veterinaria se registre, pruebe, pague y opere **sin que nadie
de ServiTec intervenga a mano**. Este documento junta el diagnóstico del estado
inicial, lo que ya se hizo y el diseño de lo que falta. Fecha de inicio:
2026-10-10.

---

## 1. Diagnóstico inicial (lo que había)

| Área | Estado encontrado |
|------|-------------------|
| Planes | Tres planes (Básico / Plus / Pro) en `lib/plans.ts`. En la base los 3 tenants reales estaban en `pro`; ninguno en `plus`. |
| Alta | Registro con Google o email, trial Pro de 10 días con datos demo. Funcionaba. |
| Fin del trial | El panel pasaba a solo lectura y el banner decía "contactate con ServiTec por WhatsApp". **Cuello de botella manual.** |
| Cobro | Existían `POST /api/billing/checkout` y `POST /api/billing/webhook` con preapproval de Mercado Pago, pero: el webhook no validaba firma, el id de la suscripción no se guardaba hasta que llegara el webhook, no había pantalla de plan/suscripción, no había forma de cancelar, y `MP_ACCESS_TOKEN` no estaba configurado. |
| Seguridad del plan | La policy `tenants_write` dejaba que **cualquier staff** (incluso un empleado) hiciera `update tenants set plan='pro'` desde la consola del navegador. |
| Cambio de plan | Solo el superadmin, a mano, desde `/superadmin`. |
| Point / factura | No existían. El kiosko original tenía Point con la API vieja (payment intents), hoy deprecada. |

---

## 2. Fase 1 — Suscripción autoservicio (HECHA)

### Decisiones

- **Dos planes, los dos pagos**: Básico ($50.000/mes, 10 turnos/mes, 1
  usuario) y **Pro** ($80.000/mes, todo). No hay plan gratis: lo gratis es la
  prueba de 10 días de Pro. Plus se eliminó: con dos opciones la decisión es
  simple; con tres hay que comparar grillas. El enum de Postgres conserva
  `plus`; `normalizePlan("plus")` devuelve `pro` y `aConfig` normaliza al
  leer, así ningún componente lo ve. Precio en `lib/plans.ts` (`PLANS.pro`).
- **Ciclo**: registro → 10 días de Pro → al vencer, el panel queda en solo
  lectura y el dueño contrata ahí mismo **Básico o Pro** (checkout de MP). Si
  después cancela, vuelve al mismo estado de solo lectura. No se cobra nada
  sin confirmación. Cambio de plan: nuevo checkout; al autorizarse, la
  suscripción anterior se cancela sola (`051_planes_pagos.sql`,
  `mp_preapproval_pendiente`).
- **Nuevas features en el catálogo**: `facturacionElectronica` y
  `mercadoPagoPoint`, ambas solo Pro.

### Qué se hizo

**Base (`supabase/049_billing_autoservicio.sql`, aplicada):**
- Trigger `tenants_proteger_billing`: nadie con sesión puede cambiar `plan`,
  `status`, `trial_expires_at` ni las columnas `mp_*` salvo superadmin. El
  service_role (webhook, cron, API routes) sí.
- (La RPC `pasar_a_basico` se creó y luego se eliminó en `051`: no hay plan
  gratis al que pasar.)
- Tabla `billing_eventos`: bitácora de webhook/checkout/cron/panel.
- Columnas en `tenants`: `mp_preapproval_status`, `mp_next_payment_date`,
  `mp_payer_email`, `trial_aviso_vence_at`, `trial_aviso_vencido_at`.

**Servidor:**
- `lib/billing/mercadopago.ts`: `getPreapproval` devuelve próximo cobro y
  pagador; `cancelarPreapproval`; `verificarFirmaWebhook` (HMAC `x-signature`
  con `MP_WEBHOOK_SECRET`).
- `lib/billing/aplicar-estado.ts`: la **única** regla estado MP → plan.
  `authorized` → Pro, activo, trial apagado. `cancelled|paused` → Básico (solo
  si es la suscripción vigente). `pending` → solo seguimiento.
- `lib/billing/dueno.ts`: autorización compartida (dueño o superadmin).
- Rutas: `checkout` (guarda el preapproval en `pending`), `webhook` (firma +
  estado real), `estado` (lectura, con `sync=1` reconsulta MP), `cancelar`.
- Cron `GET /api/cron/billing` (12:30 UTC, `vercel.json`): concilia todas las
  suscripciones contra MP y manda al dueño los emails "tu prueba vence en 3
  días" y "tu prueba terminó" (Resend; una sola vez cada uno).

**Panel:**
- Configuración → **Plan**: plan actual, trial, estado de la suscripción,
  próximo cobro, botones Suscribirme / Cancelar / Pasar a Básico, comparación.
- Banner de trial vencido con las dos acciones. Empleados ven el aviso sin
  botones.
- Dashboard: al volver del checkout (`?billing=ok`) sincroniza y avisa.
- `/pricing` y landing con 2 columnas, Pro destacado, FAQ actualizada.

### Para que funcione en producción (pendiente del dueño del proyecto)

1. En Vercel: `MP_ACCESS_TOKEN` (token de producción de la cuenta de **VetPanel**,
   la que cobra las suscripciones), `MP_WEBHOOK_SECRET`, `CRON_SECRET`,
   `RESEND_API_KEY` + `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.
2. En el panel de Mercado Pago de VetPanel → Webhooks: URL
   `https://www.vetpanel.com.ar/api/billing/webhook`, evento "Planes y
   suscripciones". Copiar la clave secreta a `MP_WEBHOOK_SECRET`.
3. Probar con un tenant de prueba: trial → vencer (desde `/superadmin`, "quitar
   trial" o esperar) → suscribirse → cancelar.

---

## 3. Fase 2 — Mercado Pago Point por veterinaria (HECHA, falta probar con terminal)

### Decisiones

- Se usa la **API de Orders** (`POST /v1/orders`, `type: point`) y la de
  terminales (`/terminals/v1/list`, `/terminals/v1/setup`). La "integration-api"
  de payment intents que usaba el kiosko está deprecada por MP.
- Cada veterinaria pega **su** access token de producción. La plata entra a su
  cuenta de MP; VetPanel no toca el dinero. El token vive en `mp_point_config`,
  tabla con RLS y **sin policies**: solo lo leen las API routes con
  service_role después de verificar que quien llama es staff del tenant.
- **La venta se registra solo cuando la terminal aprueba.** Hasta entonces no
  se toca stock ni correlativo. Si el pago sale pero `registrar_venta` falla
  (sin stock, caja…), el diálogo lo dice en rojo con el id de pago de MP para
  cargar a mano; la fila queda en `mp_point_cobros` para conciliar.

### Qué se hizo

- `supabase/050_mp_point.sql` (aplicada): `mp_point_config`, `mp_point_cobros`,
  RPC `mp_point_estado` (¿configurado? sin token), `ventas.mp_order_id` /
  `mp_payment_id`.
- `lib/mp-point/api.ts`: terminales, PDV, crear/consultar/cancelar orden,
  `interpretarOrden` (processed → aprobada; canceled/refunded → cancelada;
  expired; failed → rechazada; resto en curso).
- Rutas `app/api/mp-point/`: `config` (GET/POST/DELETE, dueño), `cobros`
  (POST, staff), `cobros/[id]` (GET poll, DELETE cancelar),
  `cobros/[id]/vincular` (ata cobro ↔ venta con service_role).
- Configuración → **Integraciones**: pegar token, lista de terminales, elegir
  una (se pone en PDV; hay que reiniciarla una vez), ticket sí/no, desconectar.
- Mostrador: con Point conectado y medio débito/crédito aparece **Cobrar con
  Point**. `CobroPointDialog` crea la orden, consulta cada 2 s, permite
  cancelar y al aprobarse llama a `cobrar(cobroId)`, que registra la venta y
  la vincula.

### Pendiente de verificar con hardware

- Nombres exactos de `status` de la orden en producción (se asumió
  `created → at_terminal → processing → processed`; MP documenta parcialmente).
  Si aparece otro, ajustar `interpretarOrden`.
- `print_on_terminal`: se manda `"seller_ticket"` / `"no_ticket"`.
- Cuotas: se envía `config.payment_method.default_installments` con costo al
  vendedor; validar que coincida con el recargo que el mostrador ya calcula.

---

## 4. Fase 3 — Factura electrónica ARCA (ex AFIP) — IMPLEMENTADA (directo, falta homologar)

**Estado al 2026-10-10:** se implementó la **opción A (directo contra ARCA)**
en vez del intermediario que recomendaba el diseño: evita un costo mensual
por veterinaria y no bloquea en elegir proveedor. Código:

- `supabase/052_facturacion.sql` (aplicada): `tenant_fiscal` (CUIT, condición
  IVA, punto de venta, ambiente, clave privada **cifrada**, CSR, certificado,
  ticket WSAA cacheado), `comprobantes` (snapshot completo, único por número
  entre emitidos, una factura por venta), RPC `facturacion_estado`,
  `productos.alicuota_iva`, `clientes.cuit` / `condicion_iva`.
- `lib/facturacion/`: `crypto.ts` (AES-256-GCM con `FACTURACION_ENCRYPTION_KEY`),
  `certificados.ts` (clave + CSR con node-forge, validación del .crt),
  `wsaa.ts` (TRA firmado CMS → token/sign), `wsfe.ts` (FEDummy,
  FECompUltimoAutorizado, FECAESolicitar, SOAP a mano), `comprobante.ts`
  (letra, receptor, reparto de IVA, QR; **puro y testeado**), `emitir.ts`
  (orquestación, idempotente por venta, nota de crédito), `factura-pdf.ts`
  (PDF con QR reutilizando el generador del remito).
- Rutas: `app/api/facturacion/config` (dueño: datos, CSR, certificado,
  probar) y `app/api/facturacion/emitir` (staff: factura o NC).
- UI: Configuración → Integraciones → Factura electrónica
  (`facturacion-config.tsx`), botón **Facturar / Descargar factura / Nota de
  crédito** en el remito y en el historial (`facturar-button.tsx`), datos
  fiscales del cliente en su perfil.

**Pendiente para salir a producción:**
1. Probar en **homologación** con un CUIT real: generar CSR, pedir certificado
   en el portal de testing de ARCA, autorizar `wsfe`, "Probar conexión",
   emitir una Factura C/B y verificar el CAE en "Comprobantes en línea".
2. Confirmar el **umbral de identificación de consumidor final** vigente
   (`ARCA_UMBRAL_IDENTIFICACION_CF`, default $417.288) con el contador.
3. Revisar alícuotas de IVA por producto (default 21 %) con cada veterinaria
   antes de habilitar producción.
4. `FACTURACION_ENCRYPTION_KEY` en Vercel (distinta de la local).

Lo que sigue es el diseño original, que se mantiene como referencia.

### Qué es

Emitir Factura B/C (consumidor final) y A (responsables inscriptos) desde el
mostrador, con **CAE** otorgado por ARCA vía web service WSFEv1, y el PDF con
el **QR obligatorio** de ARCA.

### Opciones

| Opción | Pros | Contras |
|--------|------|---------|
| **A. Directo contra ARCA** (WSAA + WSFEv1, SOAP) | Sin costo por factura. Control total. | Hay que manejar certificados por tenant, firmar CMS (PKCS#7) para WSAA, renovar el ticket de acceso cada 12 h, parsear SOAP, homologación/producción. Mucho código sensible. |
| **B. Intermediario** (TusFacturas, Facturante, Afip SDK…) | REST simple, ellos lidian con WSAA/SOAP y cambios normativos. Soporte. | Costo mensual o por comprobante que hay que trasladar o absorber. Dependencia de un tercero. |

**Recomendación: B para arrancar**, con la capa de datos diseñada para poder
pasar a A sin tocar el mostrador. El costo del intermediario se compensa con
el tiempo de desarrollo y soporte que ahorra, y es un argumento de venta del
plan Pro ("factura en un clic").

### Datos (cualquiera sea la opción)

- `tenant_fiscal` (PK `tenant_id`): CUIT, razón social, domicilio fiscal,
  condición IVA (RI / Monotributo → define si emite A/B o C), punto de venta,
  inicio de actividades, credenciales del proveedor (o cert + key cifrados si
  es directo). RLS sin policies, igual que `mp_point_config`.
- `comprobantes`: `tenant_id`, `venta_id`, tipo (1 A, 6 B, 11 C, notas de
  crédito 3/8/13), punto de venta, número, CAE, vencimiento CAE, fecha,
  importes (neto, IVA por alícuota, exento, total), receptor (doc tipo/nro,
  condición IVA, nombre), `estado` (pendiente / emitida / rechazada /
  anulada), respuesta cruda de ARCA. Índice único `(tenant_id, tipo,
  punto_venta, numero)`.
- `productos.alicuota_iva` (21 / 10.5 / 0 / exento). Default 21. Alimento y
  medicamentos veterinarios pueden tener alícuota distinta: verificar con el
  contador de cada cliente.
- `ventas` ya guarda DNI/CUIT, domicilio y condición IVA del cliente en el
  snapshot: alcanza para el receptor.

### Flujo

1. Después de registrar la venta (remito), botón **Facturar** en el
   `RemitoDialog` y en el historial de ventas. Elige tipo según condición IVA
   del emisor y del receptor (regla fija, sin preguntar).
2. `POST /api/facturacion/emitir { tenantId, ventaId }` (staff): arma el
   comprobante desde la venta, pide CAE al proveedor, guarda `comprobantes`.
   Idempotente por `venta_id`: una venta, una factura.
3. PDF: reutilizar `lib/ventas/remito-layout.ts` (`Lienzo`) con el formato de
   factura, más el QR de ARCA (JSON base64 con ver, fecha, cuit, ptoVta,
   tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec, tipoCodAut,
   codAut) en `https://www.afip.gob.ar/fe/qr/?p=…`.
4. Anular venta → nota de crédito automática si tenía factura.
5. Configuración → Integraciones → **Factura electrónica**: datos fiscales,
   punto de venta, credenciales, botón "Probar en homologación".

### Riesgos

- Alícuotas mal cargadas = factura inválida ante el fisco. El onboarding de FE
  debe pedir revisar categorías/alícuotas antes de habilitar.
- Numeración: el número lo da ARCA en orden; si dos cajas facturan a la vez
  hay que serializar por `(tenant, punto_venta)` (lock en Postgres o cola).
- Horario de ARCA: hay caídas. Guardar el comprobante en `pendiente` y
  reintentar desde un cron, sin bloquear el mostrador.

---

## 5. Otras mejoras detectadas (backlog, en orden sugerido)

1. **Onboarding guiado para Pro**: checklist en el Dashboard ("conectá tu
   Point", "cargá 5 productos", "invitá a tu equipo") con progreso. Sube la
   conversión del trial.
2. **Límite de usuarios del plan Básico** aplicado en invitaciones
   (`maxUsuarios`): hoy el límite de turnos se aplica server-side
   (`044_crear_turno_limite_server_side.sql`) pero el de usuarios no.
3. **Pausa por falta de pago**: MP pasa la suscripción a `paused` tras varios
   rechazos; hoy eso baja a Básico. Alternativa: 7 días de gracia con banner
   "actualizá tu tarjeta" antes de bajar. Decidir con datos.
4. **Pago anual** (la landing ya muestra el toggle anual "2 meses gratis",
   pero el checkout solo crea mensual): un preapproval con `frequency: 12`.
5. **Superadmin**: ver `billing_eventos` por tenant y MRR (tenants
   `authorized` × precio).
6. **Factura de VetPanel al tenant** por la suscripción: cuando exista FE
   (Fase 3), VetPanel puede facturarse a sí mismo con el mismo módulo.
7. **Webhook de Orders de MP** para Point (en vez de poll cada 2 s): menos
   latencia y funciona aunque el vendedor cierre el diálogo.
8. **`sitemap`/`robots` de `/pricing`**: hoy `noindex` porque los precios no
   eran definitivos. Con 2 planes cerrados, indexar.
9. **Test E2E del ciclo de billing** con el sandbox de MP (usuarios de prueba)
   antes de cada deploy que toque `lib/billing`.
