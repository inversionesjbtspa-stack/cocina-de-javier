# Vacation Preview Failed Fix

## Alcance

- URL objetivo: `https://cocina-de-javier.vercel.app/recursos-humanos`
- Trabajador reportado: BETANCOURT PAREZ JESUS
- Rango reportado: `2026-08-19` a `2026-08-23`
- Restricciones respetadas: sin confirmar vacaciones reales, sin crear solicitudes, sin generar comprobantes, sin modificar saldos, nominas, liquidaciones, Banco/TEF, trading ni migraciones.

## Causa exacta

El error visible `Vista previa no disponible: preview_failed` no venia del calculo FIFO ni del calendario. La causa productiva estaba antes: el endpoint `POST /api/hr/vacations/preview` no estaba desplegado en Vercel.

Evidencia:

- `OPTIONS /api/hr/vacations/preview`: HTTP `204`.
- `POST /api/hr/vacations/preview`: HTTP `405`.
- El build productivo anterior no listaba la ruta `/api/hr/vacations/preview`.
- La regla `.vercelignore` contenia `preview/`, que puede excluir cualquier carpeta llamada `preview`, incluyendo `src/app/api/hr/vacations/preview/route.ts`.

## Capa donde fallaba

- Capa principal: empaquetado/deploy Vercel por exclusion accidental de ruta API.
- Capa secundaria: UI mostraba el codigo tecnico `preview_failed` y no ataba la habilitacion de confirmacion a un preview vigente.

## Correccion aplicada

1. `.vercelignore`
   - Cambio `preview/` por `/preview/`.
   - Resultado: solo se ignora la carpeta raiz `preview`, no las rutas API internas llamadas `preview`.

2. `src/app/api/hr/vacations/preview/route.ts`
   - Agrega validacion explicita de rango: `Hasta` no puede ser anterior a `Desde`.
   - Devuelve errores de dominio con contrato `{ ok: false, code, error, message }`.
   - Reserva HTTP 500 para errores inesperados.
   - Devuelve en exito campos de contrato de presentacion: `fromDate`, `toDate`, `calendarDays`, `workingDays`, `holidays`, `nonWorkingDays`, `balanceBefore`, `balanceAfter`, `allocations`, `warnings`.
   - Mantiene el objeto `preview` existente para compatibilidad.

3. `src/components/hr/vacation-components.tsx`
   - Traduce codigos tecnicos a mensajes humanos.
   - Elimina el texto crudo `Vista previa no disponible: preview_failed`.
   - Invalida el preview al cambiar fechas u opciones.
   - Deshabilita `CONFIRMAR VACACIONES` salvo que el preview sea valido, vigente y no este cargando.

4. `tests/hr-module.test.ts`
   - Agrega test explicito para `2026-08-19` a `2026-08-23` con jornada configurada.
   - Valida rango inclusivo, dias calendario, dias habiles, fines de semana, saldo y FIFO.
   - Agrega test para contrato de errores humanos y bloqueo de confirmacion invalida.
   - Agrega test para asegurar que `.vercelignore` no excluya la ruta API.

## Jornada, calendario, FIFO y saldo

Validacion local con fixture:

- Jornada: lunes a viernes.
- Rango inclusivo: `2026-08-19` a `2026-08-23`.
- Dias calendario: `5`.
- Dias habiles: `3`.
- Sabados: `1`.
- Domingos: `1`.
- Feriados fixture: `0`.
- Saldo antes fixture: `25`.
- Saldo despues fixture: `22`.
- FIFO: asigna `3` dias al periodo mas antiguo disponible.

Nota: no se consultaron ni modificaron saldos reales de produccion durante esta correccion.

## Validacion tecnica

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm test`: OK, `46` passing, `2` skipped, `0` failed.
- `npm run build`: OK.
- Build local lista `/api/hr/vacations/preview`: SI.

## Validacion productiva

Pendiente de completar tras push/deploy productivo:

- Production Ready.
- `POST /api/hr/vacations/preview` ya no debe responder `405`.
- `/recursos-humanos` debe responder HTTP 200.
- Con sesion RRHH valida, `CALCULAR VACACIONES` debe mostrar preview y no crear solicitud.

## Archivos modificados

- `.vercelignore`
- `src/app/api/hr/vacations/preview/route.ts`
- `src/components/hr/vacation-components.tsx`
- `tests/hr-module.test.ts`
- `reports/vacation_preview_failed_fix.md`

## Confirmaciones de alcance

- Migraciones aplicadas: NO.
- Solicitud real creada: NO.
- Comprobante real creado: NO.
- Saldos modificados manualmente: NO.
- Liquidaciones modificadas: NO.
- Nominas modificadas: NO.
- Banco/TEF modificado: NO.
- Trading modificado: NO.
