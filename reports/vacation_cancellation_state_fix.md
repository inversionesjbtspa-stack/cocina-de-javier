# Correccion de anulacion de vacaciones RRHH

Fecha: 2026-09-04
Rama: fix/rrhh-vacation-cancellation-state

## Alcance

Hotfix limitado a RRHH Vacaciones. No se modifico Trading, Banco/TEF, Nominas, Liquidaciones, Pagos, Cloudflare, migraciones ni esquemas de base de datos.

## Diagnostico

Casos productivos reportados:

- FER-2026-000004: 2026-09-21 a 2026-09-25, visible como aprobada/programada despues de anular.
- FER-2026-000005: 2026-09-14 a 2026-09-17, visible como programada despues de anular.

No se ejecuto reparacion manual productiva. Se intento una lectura autenticada no destructiva via navegador/API, pero el entorno de control de navegador no estaba disponible en esta sesion. Por seguridad no se consultaron ni modificaron datos productivos por credenciales directas.

## Causa raiz encontrada en codigo

1. `src/components/hr/hr-dashboard-client.tsx:717-731`
   - La accion `cancelVacationRequest` enviaba el PATCH, pero no refrescaba la data del server component.
   - Resultado: aunque la base quedara anulada, la UI podia seguir mostrando el snapshot anterior como activo/programado.

2. `src/components/hr/hr-dashboard-client.tsx:1291-1308` y `src/components/hr/vacation-components.tsx:444-467`
   - La seccion operacional `Vacaciones recientes` recibia y renderizaba la lista completa de solicitudes del trabajador.
   - No excluia estados cancelados/anulados, por lo que una solicitud anulada podia seguir apareciendo como vacacion reciente operacional.

3. `src/app/api/hr/vacations/[id]/route.ts:51-73`
   - El endpoint llamaba el RPC con `createAdminClient()`.
   - El RPC `hr_cancel_vacation_request` depende de `hr_current_vacation_actor()` y `auth.uid()`. La llamada correcta para esa transaccion debe conservar la sesion autenticada.
   - Ademas, el endpoint devolvia OK si el RPC no fallaba, sin verificar que el estado persistido quedara efectivamente en `anulada`.

4. `src/components/hr/hr-dashboard-client.tsx:116-119`
   - Los badges visuales no contemplaban `aprobada`, `anulada` y `rechazada`, solo variantes masculinas como `aprobado`/`anulado`.

## Correcciones aplicadas

- Se agregaron helpers canonicos en `src/lib/hr/vacation-domain.ts:6-16`:
  - `isCancelledVacationRequest`
  - `isOperationalVacationRequest`

- Se corrigio el endpoint de anulacion en `src/app/api/hr/vacations/[id]/route.ts:51-73`:
  - El RPC ahora se ejecuta con cliente Supabase autenticado.
  - El admin client queda solo para lectura/verificacion por tenant.
  - La respuesta OK solo se emite si el estado persistido queda cancelado/anulado.
  - El caso `vacation_already_cancelled` se trata como idempotente si la solicitud ya esta anulada.

- Se corrigio el frontend en `src/components/hr/hr-dashboard-client.tsx:717-731`:
  - Tras anular correctamente, se ejecuta `router.refresh()`.
  - Si la solicitud ya estaba anulada, se muestra mensaje claro.

- Se corrigieron vistas operacionales:
  - `src/components/hr/hr-dashboard-client.tsx:1291-1308` filtra vacaciones operativas antes de pasarlas a `VacationRecentRequests`.
  - `src/components/hr/vacation-components.tsx:444-467` vuelve a filtrar anuladas/rechazadas dentro del componente.
  - `src/components/hr/employee-summary.tsx:37-40` usa el helper compartido para `Proximas vacaciones`.

- Se mantuvo el historial/auditoria:
  - `Comprobantes recientes` sigue mostrando solicitudes historicas, incluyendo anuladas, pero con badge correcto.
  - El boton de anulacion queda deshabilitado y rotulado como `Solicitud anulada` para estados cancelados.

## Persistencia, FIFO y saldos

No se modifico SQL ni DB. La funcion transaccional existente `hr_cancel_vacation_request` conserva el enfoque correcto:

- bloquea la solicitud `for update`;
- revierte allocations consumidas;
- registra movimiento `reversa_aprobacion`;
- marca allocations como `reversed`;
- marca solicitud como `anulada`;
- marca documentos como `anulado`;
- registra auditoria `hr.vacation_cancelled`.

El hotfix evita dobles respuestas engañosas desde API/UI, pero no altera saldos reales ni movimientos existentes.

## Pruebas ejecutadas

Runtime soportado usado para tests: Node 24.19.0 empaquetado por Codex.

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: OK, 67 tests, 65 pass, 2 skipped, 0 failed
- `npm run build`: OK

Tests nuevos relevantes:

- `HR vacation status helpers keep cancelled requests out of operational views`
- `HR vacation cancellation UI refreshes data and hides cancelled requests from active lists`

## Validacion de restricciones

- Trading modificado: NO
- Banco/TEF modificado: NO
- Nominas modificadas: NO
- Liquidaciones modificadas: NO
- Pagos modificados: NO
- Cloudflare modificado: NO
- Migraciones nuevas: NO
- Datos productivos modificados manualmente: NO
- Solicitudes reales confirmadas/anuladas durante pruebas: NO

## Pendiente productivo

FER-2026-000004 y FER-2026-000005 quedan listos para revision productiva posterior. Si al desplegar este hotfix esas solicitudes siguen con estado activo en base de datos, debe hacerse una auditoria productiva autorizada por solicitud antes de cualquier reparacion manual:

- request_id;
- status real;
- movements;
- allocations;
- receipt/document status;
- saldo antes/despues;
- existencia de reversal efectivo.

No se debe reparar manualmente sin esa autorizacion.

## Conclusion

El bug de codigo queda corregido: la anulacion se ejecuta con sesion autenticada, se verifica el estado persistido, la accion es idempotente y la UI ya no muestra anuladas como vacaciones operativas activas.
