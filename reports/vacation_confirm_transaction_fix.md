# Vacation Confirmation Transaction Fix

Fecha: 2026-08-22
Rama: fix/rrhh-vacation-confirm-transaction

## Caso validado

- Trabajador: caso real Betancourt.
- Rango: 2026-08-17 a 2026-08-23.
- Preview productivo observado: 7 dias corridos, 5 dias habiles, saldo 120.00 a 115.00, FIFO 2020-07-28 a 2021-07-27 por 5 dias.
- Estado visible antes del hotfix: LISTO PARA CONFIRMAR.
- Registros parciales visibles antes del hotfix: 0 movimientos, 0 PDF, sin vacaciones programadas.
- Codex no presiono Confirmar en produccion.

## Causa raiz

La API `POST /api/hr/vacations` devolvia errores genericos sin codigo estable y mantenia el mensaje UI "No se realizaron cambios" para fallos posteriores al pipeline de confirmacion.

El punto mas riesgoso estaba en `src/app/api/hr/vacations/route.ts`: despues de `hr_create_vacation_request` y `hr_approve_vacation_request`, el fallo de `persistVacationReceiptForRequest` devolvia HTTP 422. Ese diseno podia convertir un problema de comprobante/storage/documento en una confirmacion aparentemente fallida.

## Correccion aplicada

- Se agregaron codigos estables por etapa:
  - `VACATION_CREATE_FAILED`
  - `VACATION_APPROVAL_FAILED`
  - `VACATION_CONFLICT`
  - `VACATION_BALANCE_CHANGED`
  - `VACATION_RECEIPT_FAILED`
- Se agrego logging seguro del backend por etapa sin datos bancarios ni secretos.
- Si falla el comprobante despues de aprobar:
  - la solicitud confirmada sigue retornando `ok: true`;
  - `document_generation_status` queda en `error`;
  - se entrega `VACATION_CONFIRMED_RECEIPT_PENDING`;
  - queda disponible la vista/regeneracion del comprobante.
- Si el comprobante se genera correctamente:
  - `document_generation_status` pasa a `generated`.
- La UI muestra un mensaje humano distinto cuando la solicitud fue confirmada pero el comprobante queda pendiente.

## Atomicidad e idempotencia

- La creacion sigue usando `hr_create_vacation_request(jsonb)`.
- La aprobacion sigue usando `hr_approve_vacation_request(uuid, integer, text)`.
- FIFO, allocations y movimientos se mantienen dentro de la RPC de aprobacion.
- No se modifico el calculo legal, FIFO, saldo, feriado progresivo ni calendario.
- No se agregaron migraciones.

## Validacion local

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm test` con Node 24.16.0: 60 passed, 2 skipped, 0 failed.
- `npm run build`: OK.

## Archivos modificados

- `src/app/api/hr/vacations/route.ts`
- `src/components/hr/vacation-components.tsx`
- `tests/hr-module.test.ts`

## No modificado

- Trading: no modificado.
- Banco/TEF: no modificado.
- Nominas: no modificado.
- Liquidaciones: no modificado.
- Pagos: no modificado.
- Migraciones: no modificadas.
