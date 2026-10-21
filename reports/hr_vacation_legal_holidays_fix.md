# Feriados legales y correccion auditable de comprobante

## Causa raiz

El calendario productivo conservaba seis fechas del fixture de desarrollo y verification_status=incomplete para 2026. No incluia el 12 de octubre. calculateLegalVacationDays ya excluia correctamente sabados, domingos y feriados conocidos, pero recibia una lista incompleta. El preview permitia continuar con calendario incompleto y la confirmacion utilizaba un override. La base persistia siete dias, el movimiento -7 y el PDF reflejaba esos mismos datos: no era un fallo exclusivamente visual.

## Calendario y fuente canonica

La migracion 202610210001 incorpora las dieciseis fechas nacionales verificadas para 2026, conservando filas previas y sin corregir solicitudes existentes. Referencia oficial: https://www.gob.cl/noticias/feriados-2026-revisa-cuantos-habra-y-cuales-son-irrenunciables/ . Doctrina sobre computo: https://www.dt.gob.cl/portal/1628/w3-article-60177.html y https://www.dt.gob.cl/legislacion/1624/w3-article-109722.html .

Preview y confirmacion siguen usando calculateVacationPreview/calculateLegalVacationDays sobre hr_holiday_calendar. Se elimina el fallback productivo al fixture parcial. Un fallo de consulta impide continuar; un calendario incompleto o no verificado bloquea. La consulta se limita a calendario global y tenant actual. No se altera el calendario operacional de jornadas.

La DB agrega un contrato independiente de integridad: hr_legal_vacation_business_days y un trigger comprueban el resultado antes de insertar o modificar solicitudes activas. Ni un payload alterado ni la llamada directa a la RPC pueden confirmar siete cuando corresponden seis. Usa las mismas fechas persistidas, lunes-viernes y cierres acreditados del snapshot. Las RPC de reserva/aprobacion consumen business_days persistido y el PDF no lo recalcula ni aplica fallback silencioso.

## Correccion explicita

La migracion 202610210002 crea registro de correccion unico por solicitud, indice unico de movimiento legal_holiday_correction_credit y RPC autenticadas con permisos RRHH/tenant, search_path fijo y RLS. No concede escrituras directas sobre la nueva tabla ni EXECUTE a anon o service_role.

Flujo tecnico GET/POST /api/hr/vacations/[id]/holiday-correction: GET solo muestra comparacion; POST exige origen de la aplicacion y version esperada. Un caso sin discrepancia, con devolucion previa, allocations complejas, historial absorbido o saldo que no coincide requiere revision y no se fuerza.

Fixture: apertura inmutable 15, debito original -7, saldo 8. La correccion calcula seis dias legales, devuelve +1 y deja nueve. Conserva el movimiento -7 original y registra nuevo +1. Ajusta de forma auditada used_days y allocation a seis, guardando las filas anteriores completas; una futura anulacion revierte seis y restaura quince, nunca dieciseis. No vuelve a confirmar la solicitud ni crea otra.

La correccion conserva fecha, rango, progresivos y fraccionamiento, y actualiza conteos, saldo posterior y snapshot con trazabilidad. El PDF nuevo se guarda en corrections/<correction_id>.pdf; el archivo original no se sobrescribe. El mismo document_id recibe el nuevo puntero. Auditoria conserva motivo, hash/ruta anterior y nueva, usuario, timestamp, request y FER. Si falla generacion/documentacion despues del abono, queda pendiente explicito y el reintento no devuelve otro dia. Finalizacion de documento tambien idempotente.

## Validacion

- Node 24: typecheck, lint, tests y build.
- Suite: 153 pass, 2 skipped, 0 failed.
- PostgreSQL aislado: 20 comprobaciones PASS, 0 FAIL, incluyendo RPC real de creacion/aprobacion, movimiento -6, bloqueo de siete, correccion +1, repeticion cero, PDF auditado y anulacion posterior por seis.
- Conteo 09-19 octubre: 11 corridos, 6 habiles, 5 inhabiles; fin de semana y feriados sin doble conteo. Incluye feriado en lunes-viernes, sabado, domingo, inicio/fin feriado y multiples feriados.
- Evidencia operativa privada, respaldo, auditoria de otros comprobantes y hashes fuera de Git. No aplicar correcciones a otros trabajadores sin autorizacion.

Trading, Banco/TEF, nominas, liquidaciones y pagos fuera de alcance. No se reescribe ningun certificado ni se eliminan movimientos historicos.
