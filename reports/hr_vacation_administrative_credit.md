# Devolucion explicita por anulacion administrativa de vacaciones

## Separacion de hechos

El certificado sigue siendo una fotografia inmutable del saldo al corte. Una anulacion administrativa de efecto cero ya registrada y su auditoria tampoco se editan. La devolucion autorizada es un hecho economico nuevo, posterior al corte, con su propio movimiento y auditoria.

La migracion `202610180002_hr_vacation_administrative_credit.sql` agrega esta capacidad sin modificar la guarda de historial absorbido, la RPC de anulacion economica normal ni el renderer PDF.

## Flujo y seguridad

- La API exige `returnDays` booleano explicito, sin default ni conversion desde texto.
- El dialogo no selecciona una modalidad por defecto. Exige elegir NO, SOLO ANULAR DOCUMENTO o SI, ANULAR Y DEVOLVER DIAS y registrar un motivo.
- El modo sin devolucion usa la operacion administrativa existente, sin efecto en saldo.
- El modo con devolucion usa una sobrecarga explicita de la RPC. Si cualquier paso falla, se revierte toda la llamada.
- Para una solicitud ya anulada administrativamente sin abono se ofrece Gestionar devolucion de dias. Con abono registrado, la accion queda deshabilitada como Dias devueltos.
- RPC con sesion real, actor RRHH existente, tenant correcto, opening vigente, solicitud absorbida y descanso anterior/al corte.
- Los dias provienen exclusivamente de `business_days` persistido, nunca de un monto enviado por el cliente.
- Se bloquea la solicitud para serializar llamadas y se verifica que exista anulacion administrativa.
- Un indice unico parcial impide mas de un `administrative_cancellation_credit` por request_id, independientemente del frontend.
- Repetir un abono devuelve `already_credited=true`, `applied_days=0` y el mismo movement_id.
- Un ajuste positivo previo no reconocido como este abono detiene la operacion para revision; no se fuerza otra devolucion.
- Sin permisos nuevos para usuarios generales: funciones SECURITY DEFINER con search_path fijo y validacion de actor; EXECUTE solo a authenticated, sujeto al rol RRHH autorizado.

## Efecto contable

La mutacion explicita materializa los buckets certificados vigentes usando el mecanismo existente, si aun no existen. No materializa ni reabre periodos legacy.

El abono aumenta `positive_adjustments` del bucket certificado de apertura y crea un movimiento nuevo:

- Tipo: administrative_cancellation_credit.
- Origen: administrative_cancellation.
- Fecha efectiva: dia actual en America/Santiago.
- Referencias: request, trabajador, opening, anulacion administrativa y FER.
- Dias positivos, saldo operativo anterior/posterior, motivo, actor y fecha/hora.

No se actualizan opening balances, solicitudes financieras, allocations, movimientos legacy ni PDFs. La auditoria original de efecto cero permanece intacta; la auditoria del nuevo abono registra balance_effect positivo.

Ejemplo de fixture: certificado 27.50 + ajuste post-corte 5.00 = disponible 32.50. Una segunda ejecucion no produce 37.50. El FIFO futuro utiliza el disponible persistido 32.50; el certificado sigue siendo 27.50.

## Presentacion

La ficha separa certificado, ajustes posteriores y saldo disponible. El nuevo credito se clasifica como operativo solo cuando posee tipo, origen, fecha efectiva y periodo certificado correctos, incluso si referencia una solicitud absorbida. El debito original permanece en historial absorbido.

El comprobante sigue ANULADO ADMINISTRATIVAMENTE. Su detalle distingue el efecto inicial cero de la devolucion posterior, mostrando dias, saldos y movement_id. No se genera, borra ni sobrescribe el archivo PDF historico.

## Validacion

- Node 24: typecheck, lint, npm test y build.
- Suite de aplicacion: 137 pass, 2 skipped, 0 failed.
- PostgreSQL 17 aislado: 46 comprobaciones PASS, 0 FAIL.
- Incluye 27.50 -> 32.50, repeticion cero, concurrentes, indice unico, inmutabilidad del credito, preservacion de certificado/legacy/allocations/PDF y auditoria original, aislamiento tenant, permisos, modo cero y FIFO de 30 dias desde 32.50.

La validacion SQL usa solo UUID y documentos sinteticos, sin operaciones productivas ficticias. El respaldo, los hashes del PDF y la evidencia de ejecucion real autorizada se conservan fuera de Git por contener datos personales. Solo se debe ejecutar un abono productivo especifico tras verificar preview, ausencia de devolucion previa y respaldo consistente.

No se modifican Trading, Banco/TEF, nominas, liquidaciones, pagos, calculo legal ni porcentajes de feriado progresivo.
