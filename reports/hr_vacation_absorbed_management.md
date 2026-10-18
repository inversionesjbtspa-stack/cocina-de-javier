# Gestion segura del historial de vacaciones absorbido

## Alcance

Solo RRHH Vacaciones. No cambia calculos legales, FIFO, opening balances, saldos, archivos PDF ni otros modulos. La implementacion introduce una capacidad administrativa; no cancela automaticamente ninguna solicitud existente.

## Clasificacion visual

El filtro anterior usaba `effective_date ?? created_at` e incluia registros tardios del historial absorbido como movimientos post-corte.

`src/lib/hr/vacation-history.ts` ahora da prioridad a `absorbed_request_ids`, luego al opening del periodo y a fechas semanticas: fecha efectiva, inicio de vacaciones o devengo del periodo. La fecha de registro no clasifica efectos economicos. Los registros sin evidencia suficiente quedan separados para revision, no se presumen operativos.

La ficha muestra:

- MOVIMIENTOS OPERATIVOS DESPUES DEL CORTE.
- HISTORIAL ANTERIOR AL SALDO CERTIFICADO, plegable y con scroll.
- Movimientos sin fecha operativa verificada, si existen.

El historial conserva fecha original, tipo, dias, periodo, solicitud, FER y estado. Los requests absorbidos llevan una etiqueta explicita. El calculo del saldo certificado permanece en el motor existente; no usa estas listas visuales.

## Mensaje y acciones

`legacy_vacation_requires_cutoff_review` se transforma en una explicacion humana de la restriccion y la gestion administrativa, tanto en la API como en la UI. El resultado de la accion se muestra dentro de la ficha, no solo en el banner exterior al modal. Se bloquean reintentos simultaneos desde la misma ficha.

Las solicitudes nuevas conservan Anular solicitud y la RPC economica existente. Las historicas verificadas usan ANULAR ADMINISTRATIVAMENTE; las historicas sin evidencia suficiente muestran REQUIERE GESTION HISTORICA. Una cancelacion administrativa ya registrada no ofrece repetir la accion.

## Modelo administrativo, no bypass

Migracion aditiva: `202610180001_hr_vacation_administrative_cancellation.sql`.

Nueva tabla inmutable: `hr_vacation_administrative_cancellations`, con solicitud unica, tenant, trabajador, opening, FER, motivo, usuario, timestamp, balance_before, balance_after y balance_effect.

- CHECK exige balance_effect = 0 y balance_before = balance_after.
- FK compuesta valida tenant/trabajador/opening.
- RLS de lectura usa los roles RRHH existentes: owner, admin, finance_manager.
- Sin INSERT/UPDATE/DELETE directo para authenticated ni service_role.
- RPC explicita SECURITY DEFINER con search_path fijo y auth.uid() mediante el actor RRHH existente.
- EXECUTE revocado a PUBLIC, anon y service_role; solo authenticated puede invocar, sujeto a permisos del actor.
- Elegibilidad: opening vigente, request en absorbed_request_ids, descanso terminado a mas tardar en el corte y request no perteneciente al opening operativo actual.
- Bloqueo por solicitud y unicidad garantizan idempotencia y serializan reintentos.
- Lectura coherente de buckets certificados sin materializar periodos.
- Solo inserta la entidad administrativa y su audit_event, en la misma transaccion.

La RPC no actualiza el estado financiero original de la solicitud: guarda un estado administrativo separado que la ficha presenta como ANULADO ADMINISTRATIVAMENTE. Conserva el estado y snapshot financiero originales para auditoria, ademas del PDF original. Las vistas activas excluyen el estado administrativo cancelado.

No se modifica ni deshabilita `hr_guard_absorbed_vacation_reversal`; la anulacion economica de historial absorbido sigue rechazada. No se insertan reversas, no se actualizan allocations, periodos, solicitudes financieras, documentos ni certificados y no se llama a Storage o al renderer PDF desde la nueva accion.

Endpoint: POST `/api/hr/vacations/[id]/administrative-cancel`, con sesion autenticada y motivo obligatorio. No usa service role para invocar la RPC.

## Pruebas locales

Node compatible de desarrollo: runtime Node 24 disponible en el entorno.

- npm run typecheck: OK.
- npm run lint: OK.
- npm test: 129 pass, 2 skipped, 0 failed.
- npm run build: OK.
- PostgreSQL 17 aislado, 127.0.0.1:55439: 20 comprobaciones PASS, 0 FAIL.

Las comprobaciones SQL usan solo UUID, personas/documentos sinteticos y una base nueva. Validan migracion repetible, guarda economica intacta, saldo 27.50 -> 27.50, efecto cero, idempotencia, reintentos concurrentes, auditoria unica, FIFO y PDF sin cambios, otro certificado/tenant intacto, rechazo de acceso cruzado, rechazo de usuario sin permiso/sesion, RLS de lectura y ausencia de privilegio de INSERT directo. Tambien prueban que una solicitud normal no usa la via administrativa y su reversa economica sigue devolviendo dias al bucket correcto.

Las pruebas unitarias incluyen fechas historicas registradas despues del corte, prioridad de absorcion, clasificacion de devengos y movimientos desconocidos, mensaje humano, eleccion de accion y exclusion de anuladas administrativamente de vistas activas.

## Publicacion y validacion operativa

Aplicar exclusivamente la migracion aditiva revisada antes de publicar la aplicacion. No aplicar otras migraciones pendientes. Registrar version y checksum en el historial de migraciones.

Antes/despues: comparar firmas de todos los certificados, solicitudes, movimientos, allocations, periodos, documentos y empleados; comparar metadata del PDF y definiciones de guarda/RPC economica. La nueva tabla debe seguir vacia durante la validacion productiva: no ejecutar su RPC mutante para probar.

Publicar mediante push normal e integracion fast-forward segura si main no ha avanzado; esperar Production Ready del commit exacto. En la ficha real validar saldo, clasificacion, FER historico y boton administrativo SIN pulsarlo. Conservar la evidencia productiva fuera de Git para no publicar datos personales.
