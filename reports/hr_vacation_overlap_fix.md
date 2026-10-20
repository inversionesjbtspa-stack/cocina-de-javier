# Solapamiento y anulaciones administrativas

## Causa

La anulacion administrativa es un overlay en `hr_vacation_administrative_cancellations`: conserva el estado financiero original de `hr_vacation_requests` para no reescribir el historial certificado. La ficha aplicaba ese overlay para presentar ANULADO ADMINISTRATIVAMENTE, pero el preview consultaba directamente estados de la tabla original. `hr_vacation_has_overlap` tenia la misma omision. Un registro originalmente aprobado seguia bloqueando aunque estuviera anulado administrativamente.

## Correccion

`202610200001_hr_vacation_overlap_administrative.sql` actualiza la funcion canonica existente `hr_vacation_has_overlap`. Conserva limites inclusivos, aislamiento por tenant/trabajador y exclusion de la propia solicitud. Excluye mediante NOT EXISTS una anulacion administrativa que coincida en request, tenant y trabajador. No depende de que exista devolucion de dias: ambos modos administrativos dejan de bloquear.

Estados reales que bloquean: solicitada, pendiente, aprobada, en_curso y finalizada. Finalizada conserva la proteccion de vacaciones efectivamente disfrutadas. Las etiquetas de presentacion CONFIRMADA/PROGRAMADA no son nuevos estados de DB. Anulada, rechazada y overlay administrativo no bloquean. Borrador sigue sin bloquear como antes; no se crean estados artificiales.

La nueva RPC de lectura `hr_preview_vacation_overlap` valida sesion real, rol RRHH y trabajador del tenant del actor, sin aceptar tenant desde el cliente. Usa la funcion canonica ya invocada por creacion, reserva y aprobacion. El endpoint de preview deja de duplicar filtros SQL y consume esa RPC autenticada. Error o resultado no booleano bloquean de forma segura. Frontend solo muestra `vacation_overlap`/`vacation_overlap_check_failed` y `canConfirm` del backend.

No se conceden permisos sobre tablas ni se modifica RLS. El helper interno sigue sin EXECUTE para usuarios/API; la entrada de preview se concede a authenticated con controles de actor/tenant, no a anon ni service_role. SECURITY DEFINER con search_path fijo. Migracion transaccional y repetible, sin escrituras en tablas de negocio.

## Recorrido

- UI: `VacationRequestForm`, `previewReviewReasons` y `humanVacationReviewReason`, en `src/components/hr/vacation-components.tsx`.
- API: POST `/api/hr/vacations/preview`.
- RPC de preview: `hr_preview_vacation_overlap`.
- Consulta canonica compartida con las mutaciones: `hr_vacation_has_overlap`.
- Creacion/reserva/aprobacion mantienen sus protecciones transaccionales existentes; no se cambian calculo, saldo, FIFO, credito ni comprobantes.

## Pruebas

Node 24: typecheck OK, lint OK, npm test 142 pass / 2 skipped / 0 failed, build OK.

PostgreSQL 17 aislado, solo fixtures: 68 PASS / 0 FAIL. Incluye aprobada y pendiente superpuestas, anulada/rechazada sin bloqueo, aprobada con overlay administrativo sin bloqueo, finalizada bloqueante, limites inclusivos, fechas adyacentes, exclusion de la propia solicitud, tenant ajeno, rol insuficiente, sesion ausente y preview sin mutaciones. Conserva las 46 comprobaciones previas de credito/idempotencia y preservacion del historial.

Fixture de siete dias corridos y cinco habiles: disponible 32.50, descuento proyectado 5.00, saldo proyectado 27.50. Acuerdo de fraccionamiento explicito cuando corresponde; este hotfix no elimina ese bloqueo legitimo.

Las comprobaciones productivas se limitan a lectura y preview. No confirmar solicitudes, no devolver dias otra vez, no regenerar PDFs. El respaldo privado, hashes, comprobaciones antes/despues y evidencia visual se guardan fuera de Git por contener informacion personal.

Trading, Banco/TEF, nominas, liquidaciones y pagos fuera de alcance y sin cambios.
