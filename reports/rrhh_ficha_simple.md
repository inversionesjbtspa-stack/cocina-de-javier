# Cierre tecnico - Ficha RRHH simplificada

Fecha: 2026-08-20  
Rama: feat/rrhh-ficha-simple  
Base: 3b2251e  
Commit implementacion: 73aae53

## Navegacion anterior

La ficha individual del trabajador mostraba 9 pestanas:

- Datos personales
- Contrato
- Banco
- Novedades
- Vacaciones
- Liquidaciones
- Pagos
- Documentos
- Auditoria

## Navegacion nueva

La ficha individual queda con 4 pestanas visibles:

- Datos personales
- Banco
- Vacaciones
- Liquidaciones

Compatibilidad interna: las llamadas antiguas a `contract`, `novelties` y `audit` redirigen a Datos personales; `payments` redirige a Banco; `documents` redirige a Liquidaciones.

## Informacion reubicada

- Contrato: reubicado en Datos personales / Informacion laboral.
- Pagos: reubicado en Banco / Historial de pagos.
- Documentos: disponibles donde corresponden, especialmente Liquidaciones y comprobantes de Vacaciones.
- Auditoria: queda como trazabilidad interna y no como pestana cotidiana.
- Novedades: se conserva el modelo y rutas existentes; ya no ocupa pestana en la ficha.

## Datos personales y jornada

Datos personales ahora incluye nombre, RUT visible, telefono, email personal/laboral, comuna, direccion, fecha de ingreso, antiguedad, cargo, area, centro de costo, sueldo base, estado laboral y jornada.

Jornada laboral:

- Lunes a viernes
- Lunes a sabado
- Personalizada con L/M/X/J/V/S/D

Se persiste de forma estructurada en `hr_employees.work_schedule` desde `src/app/api/hr/employees/[id]/route.ts`. Vacaciones ya consume ese mismo campo mediante `parseVacationWorkSchedule`.

Si falta jornada, se muestra alerta en Datos personales y Vacaciones.

## Banco e historial de pagos

Banco muestra estado humano:

- COMPLETO
- INCOMPLETO
- REVISAR

El historial muestra fecha, periodo, monto, banco, tipo cuenta, cuenta utilizada enmascarada, estado y referencia/lote.

La cuenta historica se lee desde snapshots de `hr_payment_items` (`bank_name`, `bank_code`, `account_type`, `account_number`, `payment_email`). Si una fila antigua no tiene snapshot, se muestra "No registrado"; no se inventan datos desde la cuenta actual.

La exportacion de historial genera un archivo Excel-compatible `.xls` desde los pagos filtrados. No modifica pagos.

## Vacaciones

Vacaciones conserva el motor persistente existente:

- Periodos por contrato.
- Suma de saldo pendiente por periodos.
- Estados simples en UI mediante los componentes existentes.
- Solicitud con Desde/Hasta y boton Calcular Vacaciones.
- Calculo de dias corridos, habiles, feriados, no habiles, saldo antes/despues y FIFO.
- Detalle tecnico, movimientos, ledger legacy y ajustes quedan dentro de `Detalle / Auditoria`, colapsados.

Feriado manual:

- Se agrega como opcion avanzada simple en la solicitud.
- El backend valida que la fecha este dentro del rango.
- No duplica un feriado automatico ya detectado.
- Se registra en observacion/snapshot de la solicitud.
- No requirio migracion nueva.

## Comprobante de feriado

No se modifico el DOCX original adjunto ni se subio al repositorio.

El generador existente mantiene los bloques requeridos por la referencia:

- COMPROBANTE DE FERIADO
- datos empresa
- periodo contractual
- Don
- Desde / Al
- Detalle del feriado
- Dias habiles
- Domingos e inhabiles
- Saldo pendiente
- firmas

Tambien mantiene la proteccion contra watermark TRIAL validada por tests existentes.

## Liquidaciones

La ficha muestra una fila por mes con:

- Periodo
- Liquido a pagar
- Estado
- PDF individual
- Envio individual
- Estado de pago asociado cuando existe

La carga individual queda colapsada. No hay envio masivo dentro de la ficha.

## Migraciones

No se creo migracion nueva. Se reutilizaron columnas existentes:

- `hr_employees.work_schedule`
- snapshots bancarios en `hr_payment_items`

No se aplicaron migraciones durante esta fase.

## Seguridad

- No se agrego service role al frontend.
- No se exponen cuentas completas en pantalla: el historial usa `****1234`.
- Los endpoints RRHH existentes conservan `requireHrContext`.
- No se modificaron RLS/grants.
- No se tocaron pagos bancarios ni TEF.
- No se tocaron trabajadores productivos durante pruebas locales.

## Archivos modificados

- `src/components/hr/hr-dashboard-client.tsx`
- `src/components/hr/vacation-components.tsx`
- `src/app/api/hr/employees/[id]/route.ts`
- `src/app/api/hr/vacations/preview/route.ts`
- `src/app/api/hr/vacations/route.ts`
- `src/lib/hr/data.ts`
- `tests/hr-module.test.ts`

## Tests y build

Ejecutado con Node v24.19.0:

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: OK, 47 pass, 2 skipped por fixtures opcionales
- `npm run build`: OK

## Commit, push y produccion

- Commit local: `73aae53 feat(rrhh): simplify employee profile around core workflows`
- Rama publicada: `origin/feat/rrhh-ficha-simple`
- Main productivo actualizado: `origin/main` = `73aae53`
- URL productiva comprobada: `https://cocina-de-javier.vercel.app/recursos-humanos`
- HTTP publico sin sesion: 307 a `/login?next=%2Frecursos-humanos`
- HTTP login publico: 200

Limitacion de validacion: no se pudo completar validacion visual autenticada desde esta sesion porque la URL productiva exige login y el navegador controlado no entrego una sesion interactiva utilizable. No se usaron credenciales ni se forzo acceso.

## Alcance preservado

- Trading intacto.
- Cloudflare intacto.
- Estrategia/TP/SL externos intactos.
- Banco/TEF preservado.
- Datos historicos no eliminados.

## Riesgos pendientes

- La exportacion de historial bancario es Excel-compatible `.xls`, no XLSX nativo. No se agrego dependencia nueva para evitar ampliar superficie tecnica.
- La validacion visual autenticada en produccion debe confirmarse despues del despliegue con sesion RRHH.
