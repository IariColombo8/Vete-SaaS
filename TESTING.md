# Testing

## Unitarios (Vitest)

Corren en CI y localmente sin dependencias externas.

```bash
npm test            # corre todos los tests unitarios una vez
npm run test:watch  # modo watch
npm run test:coverage
```

Cubren funciones puras: `lib/turnos/horarios.ts` (slots, disponibilidad, días) y
`lib/plans.ts` (feature-gating, límites).

## E2E (Playwright) — `e2e/`

Requiere navegadores y un servidor levantado (Playwright lo arranca solo).

```bash
npx playwright install        # una sola vez: instala los navegadores
npm run test:e2e              # levanta `npm run dev` y corre los smoke tests
```

- Apuntar a un entorno ya desplegado: `E2E_BASE_URL=https://... npm run test:e2e`.
- Probar el flujo de reserva de un tenant: `E2E_TENANT_SLUG=mi-clinica npm run test:e2e`
  (si no se define, ese test se saltea).

Smoke tests incluidos: landing, `/pricing`, `/login` y (opcional) reserva de turno.

## Firestore Rules (emulador) — `firestore.rules.test.ts`

Requiere `firebase-tools`. Valida `firestore.rules` contra el emulador.

```bash
npm i -g firebase-tools       # si no está instalado
npm run test:rules            # firebase emulators:exec + vitest (config dedicada)
```

Verifica: lectura pública de `config`, escritura de config solo por el dueño,
acceso del empleado a turnos, bloqueo a usuarios ajenos, y que un usuario no
pueda auto-asignarse `role`.

> Estos dos últimos (E2E y rules) no corren en `npm test` ni en el CI por
> defecto porque necesitan navegador / emulador. Están listos para integrarse
> a un workflow de CI con esos servicios disponibles.
