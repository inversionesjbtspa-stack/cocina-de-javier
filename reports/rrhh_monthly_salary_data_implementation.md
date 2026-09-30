# Implementacion RRHH Mensual - Datos Sueldos

Fecha: 2026-09-30
Rama: feat/rrhh-monthly-salary-data

## Alcance implementado

Se implementaron las etapas B, C, D y E del flujo RRHH mensual a nivel local, sin escribir datos productivos, sin aplicar migraciones, sin modificar Trading, sin push y sin deploy.

## Navegacion final

La navegacion principal visible de RRHH queda reducida a:

1. Trabajadores
2. Nominas
3. Datos Sueldos
4. Liquidaciones

Los componentes legacy de Programacion, Importaciones y Dashboard no fueron borrados; quedaron fuera de la navegacion principal.

## Error tecnico eliminado de UI

El codigo tecnico `hr_payment_batch_invalid_rows` ya no se muestra directamente desde la UI de creacion de lotes. Se traduce a:

"Hay filas de nomina que requieren revision antes de crear el lote."

## Mapeo A:V

Se agrego documentacion interna en `src/lib/hr/salary-export-map.ts` mediante `SALARY_COLUMN_DEFINITIONS`.

La grilla de Datos Sueldos renderiza el contrato A:V de la plantilla:

- plantilla: `src/templates/rrhh/datos-sueldos-contador.xlsx`
- hoja: `LIBRO REMUNERACIONES`
- encabezados: fila 5
- trabajadores: desde fila 6
- columnas: A:V

No se renombro la plantilla base ni se cambiaron encabezados.

## Datos Sueldos mensual

`buildSalaryRows` ahora construye una vista mensual consolidada por trabajador activo productivo y periodo.

Campos automaticos conectados desde `hr_payment_items` validos:

- Anticipos -> Q `ANTICIPOS`
- Anticipo aguinaldo -> V `ANTICIPO AGUINALDO`
- Aguinaldo -> U `AGUINALDO`
- Bono produccion -> I `BONO PRODUCCION`
- Bono compensatorio -> K `BONO COMP,`
- Bono responsabilidad -> M `BONO RESPONSABILIDAD`
- Recargo domingo -> L `RECARGO DOMINGO`
- Prestamo empresa -> S `PTMO EMPRESA`
- Prestamo caja / CCAF / trabajador -> T `PRESTAMO CAJA`

Estados considerados validos para suma:

- `aprobado`
- `pendiente_pago`
- `incluido_en_nomina`
- `en_nomina`
- `pagado`

Estados anulados no se suman.

## Conceptos manuales

La grilla permite editar directamente campos manuales como:

- centro de costo;
- inasistencias;
- motivo;
- horas extras;
- movilizacion;
- telefono;
- caja;
- otros campos sin fuente automatica activa.

Los valores se guardan con el flujo existente de `hr_accountant_data_rows` y su RPC auditada.

## Proteccion de automaticos

Cuando una celda viene desde movimientos ERP automaticos, se muestra como lectura en la grilla para evitar sobrescritura silenciosa.

Los ajustes manuales separados como entidad propia quedan como recomendacion futura si se requiere corregir un automatico sin alterar su fuente.

## Idempotencia

Los agregados automaticos usan una clave de deduplicacion local por:

- payment item id;
- concepto destino.

Un refresh no duplica el total si no existen nuevos movimientos.

## Anulaciones

Los pagos con estado `anulado` no alimentan Datos Sueldos. El recalculo se realiza desde movimientos validos persistidos.

## Exclusion CODEX

Se agrego filtro tecnico en `src/lib/hr/employee-filters.ts`.

Quedan excluidos de:

- Datos Sueldos;
- seleccion masiva de Nominas;
- generacion/preview TEF;
- KPI principales de RRHH;
- API de creacion de lote si se intenta por payload manual.

No se borran trabajadores.

## Exportacion contador

La exportacion del endpoint `GET /api/hr/accountant-data` ahora usa la misma agregacion automatica mensual que la UI y conserva la plantilla.

Nombre de archivo:

`DATOS SUELDOS <MES> <ANIO>.xlsx`

Ejemplo:

`DATOS SUELDOS SEPTIEMBRE 2026.xlsx`

## Banco/TEF

El flujo TEF se mantiene intacto en su formato A:K. Solo se agrego exclusion preventiva de trabajadores tecnicos CODEX en el endpoint de preview/export.

## Tests agregados/verificados

Se agregaron/actualizaron pruebas para:

- navegacion principal de 4 modulos;
- ocultamiento de Programacion/Importaciones/Dashboard en nav principal;
- mensaje humano para error tecnico de lotes;
- exclusion CODEX;
- suma de multiples anticipos;
- exclusion de anticipo anulado;
- aguinaldo automatico;
- bono compensatorio automatico;
- preservacion de columna V;
- exportacion desde plantilla A:V.

## Validacion local

Resultados:

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: 74 pass, 2 skipped, 0 failed usando Node compatible del runtime Codex
- `npm run build`: OK

Nota: el `node` del PATH del sistema no soporta `--experimental-strip-types`; para tests se uso el Node empaquetado por Codex.

## Archivos modificados por esta implementacion

- `src/app/api/hr/accountant-data/route.ts`
- `src/app/api/hr/payment-template/route.ts`
- `src/app/api/hr/payments/batch/route.ts`
- `src/components/hr/hr-dashboard-client.tsx`
- `src/lib/hr/data.ts`
- `src/lib/hr/payroll-parser.ts`
- `src/lib/hr/salary-data.ts`
- `src/lib/hr/salary-export-map.ts`
- `src/lib/hr/employee-filters.ts`
- `tests/hr-module.test.ts`
- `reports/rrhh_monthly_salary_data_audit.md`
- `reports/rrhh_monthly_salary_data_implementation.md`

## Cambios preexistentes no atribuibles a esta implementacion

El worktree ya contenia cambios pendientes antes de esta implementacion en:

- `src/app/api/hr/payment-template/route.ts`
- `src/components/hr/hr-dashboard-client.tsx`
- `src/lib/hr/bank-tef.ts`
- `tests/hr-module.test.ts`

Tambien existian reportes/directorios no versionados previos. No se descartaron.

## Deploy

No se hizo push ni deploy en esta ejecucion. Motivo: el worktree ya incluia cambios preexistentes de Banco/TEF y reportes sin separar en commits, por lo que hacer push/deploy podria mezclar alcances.

## Pendientes recomendados antes de produccion

1. Separar/confirmar los cambios preexistentes de Banco/TEF.
2. Confirmar si se requiere una tabla futura de ajustes manuales separados para automaticos.
3. Confirmar decision funcional sobre columnas H/J/R no usadas y V solo automatica.
4. Validar visualmente en preview con datos reales en modo lectura.
5. Hacer commit/push/despliegue controlado en una etapa autorizada.

## Confirmacion de no alcance

- Trading intacto.
- Banco/TEF sin cambio de formato de archivo.
- Liquidaciones intactas.
- Vacaciones intactas.
- No se aplicaron migraciones.
- No se escribieron datos productivos.
- No se hizo push.
- No se hizo deploy.
