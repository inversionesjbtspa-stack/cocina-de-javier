# RRHH Vacaciones Simplificadas

## Diagnostico inicial

- Base productiva de referencia: `788c201`.
- La implementacion existente ya tenia periodos persistidos, FIFO, RPC transaccional de creacion/aprobacion/cancelacion, comprobante HTML/PDF y storage privado.
- El problema principal era UX: el formulario normal exponia dias manuales, estado tecnico, fraccionamiento, anticipadas, observaciones y acumulacion legacy como si fueran parte del flujo diario.
- El calculo de dias habiles asumia lunes a viernes para todos los trabajadores aunque el modelo ya tenia `work_schedule`.
- La confirmacion aprobada devolvia la solicitud, pero el PDF persistido dependia de visitar luego la ruta `papeleta?persist=1`.

## UX anterior vs nueva

- Antes: formulario amplio con campos tecnicos visibles, boton "Vista previa" y "Guardar solicitud", mas bloque legacy de acumulacion en la vista normal.
- Ahora: flujo principal visible con `Desde`, `Hasta`, `CALCULAR VACACIONES`, preview, `CONFIRMAR VACACIONES` y botones de comprobante despues de confirmar.
- Las opciones tecnicas quedaron en `Opciones avanzadas`.
- Movimientos persistentes, ledger legacy, periodos y acumulacion/ajuste legacy quedaron en `Detalle / Auditoria`.
- Se agrego historial simple `Vacaciones recientes`.

## Servicio de calculo

- `src/lib/hr/vacation-domain.ts` agrega clasificacion de calendario:
  - `WORKING_DAY`
  - `WEEKEND`
  - `HOLIDAY`
  - `OTHER_NON_WORKING_DAY`
- El preview ahora devuelve:
  - dias calendario;
  - dias habiles;
  - no habiles desglosados;
  - feriados aplicados;
  - work calendar;
  - saldo antes;
  - saldo despues;
  - distribucion FIFO;
  - alerta si la jornada contractual requiere revision.

## Calendario laboral y feriados

- Se reutiliza `hr_holiday_calendar` y `hr_holiday_calendar_years`.
- Si no hay filas disponibles, se conserva el fallback existente `CHILE_HOLIDAYS_FIXTURE`.
- No se agregaron llamadas externas por solicitud.
- No se agregaron feriados hardcodeados productivos nuevos.

## Jornadas soportadas

- `src/lib/hr/vacation-server.ts` interpreta `work_schedule` como JSON con `workingWeekdays` o texto legacy:
  - lunes a viernes / `lun-vie` / `5x2`;
  - lunes a sabado / `lun-sab` / `6x1`.
- Si no existe jornada usable, el preview mantiene compatibilidad con calendario base, pero muestra `REVISAR JORNADA CONTRACTUAL`.

## FIFO, saldo diario y saldo proyectado

- No se creo un motor paralelo.
- FIFO sigue usando `allocateVacationFifo`.
- El saldo operativo se calcula desde periodos persistidos y no requiere movimientos diarios.
- El preview separa saldo operativo antes/despues y proporcional proyectado.

## Migracion

- No se creo migracion nueva.
- No se modificaron migraciones existentes.
- No se aplicaron migraciones desde esta ejecucion.

## Seguridad y comprobante

- La ruta de confirmacion sigue usando `requireHrContext`, tenant scope y RPC existente.
- La aprobacion continua pasando por `hr_approve_vacation_request`.
- El comprobante se persiste automaticamente con `persistVacationReceiptForRequest`.
- El PDF usa `hr-vacation-documents`, `upsert` por `tenant_id,vacation_request_id,document_type` y hash SHA-256.
- El modelo reproduce funcionalmente el DOCX de referencia: empresa, trabajador, periodo contractual, descanso, detalle dias, saldo y firmas.
- No se modifico el DOCX original.

## Componentes modificados

- `src/components/hr/vacation-components.tsx`
- `src/components/hr/hr-dashboard-client.tsx`
- `src/components/hr/employee-summary.tsx`

## Backend modificado

- `src/lib/hr/vacation-domain.ts`
- `src/lib/hr/vacation-server.ts`
- `src/app/api/hr/vacations/preview/route.ts`
- `src/app/api/hr/vacations/route.ts`

## Tests

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm test`: OK, 43 aprobados, 2 saltados por fixtures opcionales.
- `npm run build`: OK.

Cobertura nueva:

- Clasificacion de calendario laboral.
- Jornada lunes-viernes vs lunes-sabado.
- Feriado no descuenta dia.
- Preview expone dias calendario y saldo posterior.
- UX simple contiene calcular/confirmar/opciones avanzadas/historial simple.
- Ruta de confirmacion invoca persistencia automatica de comprobante.

## Alcance no tocado

- Trading: intacto.
- Banco/TEF: intacto.
- Nominas: intacto.
- Liquidaciones: intacto.
- Pagos: intacto.
- Cloudflare: intacto.

## Commit y deploy

- Rama de trabajo: `feat/rrhh-vacaciones-simplificadas`.
- Commit: `d344766 feat(rrhh): simplify vacation requests and generate receipts`.
- `main` remoto actualizado por fast-forward desde `788c201` a `d344766`.
- Vercel Production: `READY`.
- Deployment: `dpl_72Bmr6yZtm3RrC9BwDQkZ5asX89b`.
- URL publica: `https://cocina-de-javier.vercel.app/recursos-humanos`.
- Validacion publica:
  - `/recursos-humanos`: HTTP 200.
  - `/api/health/supabase`: HTTP 200.
  - Supabase reporta `publicConfigured=true`, `adminConfigured=true`, `protected=true`.

## Riesgos pendientes

- La validacion productiva autenticada debe hacerse despues del deploy con un rango ficticio/controlado y sin confirmar vacaciones reales sin autorizacion.
- La jornada `TURNOS` queda marcada para revision contractual si no viene normalizada como `workingWeekdays`.
- El estado idempotente final depende de las constraints/RPC ya existentes; no se agrego columna nueva de idempotency key porque no se requirio migracion.
