# Etapa A+B RRHH - Ficha Central y Vacaciones Persistentes

Fecha: 2026-08-13
Rama: `feat/rrhh-vacaciones-persistentes`
Base: `main` en `7bd048b merge: corrige nominas desde liquidaciones`

## Alcance Implementado

### Etapa A - Ficha Central del Trabajador

- Se agrego un resumen central de trabajador que consolida datos de contrato, vacaciones, liquidaciones, pagos, documentos y alertas.
- La ficha central consume solamente fuentes RRHH ya presentes en `HrDashboardData`.
- No se creo tabla nueva de trabajador ni se duplico informacion maestra.
- Se separaron componentes visuales de vacaciones fuera del cliente monolitico principal.

Archivos:
- `src/components/hr/employee-summary.tsx`
- `src/components/hr/vacation-components.tsx`
- `src/components/hr/hr-dashboard-client.tsx`
- `src/lib/hr/data.ts`

### Etapa B - Vacaciones Persistentes

- Se agrego backfill idempotente de periodos contractuales reales desde fecha de ingreso.
- Las rutas de preview/creacion de vacaciones aseguran periodos persistidos antes de calcular FIFO.
- Se agrego dominio puro para:
  - periodos esperados;
  - preview de backfill;
  - deteccion de conflictos;
  - balance reproducible al corte.
- Se agrego importacion masiva de vacaciones con preview/commit:
  - CSV/XLSX;
  - asociacion exclusivamente por RUT;
  - hash por fila;
  - bloqueo de duplicados;
  - estados LISTO, DUPLICADO, REVISAR, TRABAJADOR NO ENCONTRADO, PERIODO NO RESUELTO y DATOS INVALIDOS.
- Se corrigio en el parser nuevo que una celda numerica vacia no sea tratada como `0`.

Archivos:
- `src/lib/hr/vacation-persistence.ts`
- `src/lib/hr/vacation-import.ts`
- `src/app/api/hr/vacations/periods/backfill/route.ts`
- `src/app/api/hr/vacations/import/route.ts`
- `src/app/api/hr/vacations/preview/route.ts`
- `src/app/api/hr/vacations/route.ts`
- `supabase/migrations/202608130001_hr_vacation_persistence_imports.sql`

## Migracion

Nueva migracion:

- `supabase/migrations/202608130001_hr_vacation_persistence_imports.sql`

Caracter:

- Aditiva.
- No elimina tablas.
- No borra datos.
- Agrega columnas de importacion a `hr_vacation_movements`.
- Crea `hr_vacation_import_batches`.
- Agrega RLS a la tabla nueva.
- Agrega grants minimos a `authenticated` y `service_role`; no otorga permisos a `anon`.
- Agrega indice unico parcial para idempotencia por `row_hash`.

No se aplico a produccion desde esta ejecucion.

## Validaciones Ejecutadas

Comandos:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `C:\Users\Usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --experimental-strip-types --test tests/*.test.ts`

Resultados:

- Typecheck: OK.
- Lint: OK.
- Build: OK.
- Tests: 42 OK, 0 fallos, 2 omitidos por fixtures opcionales.
- Revalidacion de cierre con Node `v24.19.0`: typecheck OK, lint OK, build OK, tests OK.

Nota de entorno:

- Node del sistema: `v20.20.2`.
- Tests ejecutados con Node bundled Codex: `v24.19.0`, requerido por `--experimental-strip-types`.

## Pruebas Nuevas

Agregadas en `tests/hr-module.test.ts`:

- Backfill de periodos persistentes deterministico e idempotente.
- Balance de vacaciones reproducible desde periodos y movimientos.
- Preview de importacion masiva por RUT con listo, duplicado, no encontrado, revision e invalido.
- Migracion de persistencia de vacaciones aditiva y con idempotencia.
- Migracion sin grants a `anon`.

## No Modificado

Confirmado por alcance de diff:

- Trading: no modificado.
- Cloudflare: no modificado.
- Banco/TEF/payment-template: no redisenado ni cambiado como flujo.
- Liquidaciones a nomina: no modificado.
- Cierre mensual: no implementado.
- Nominas/banco etapa posterior: no implementada.

## Archivos Modificados

- `src/app/api/hr/vacations/preview/route.ts`
- `src/app/api/hr/vacations/route.ts`
- `src/components/hr/hr-dashboard-client.tsx`
- `src/lib/hr/data.ts`
- `src/lib/hr/vacation-server.ts`
- `tests/hr-module.test.ts`

## Archivos Creados

- `src/app/api/hr/vacations/import/route.ts`
- `src/app/api/hr/vacations/periods/backfill/route.ts`
- `src/components/hr/employee-summary.tsx`
- `src/components/hr/vacation-components.tsx`
- `src/lib/hr/vacation-import.ts`
- `src/lib/hr/vacation-persistence.ts`
- `supabase/migrations/202608130001_hr_vacation_persistence_imports.sql`
- `reports/rrhh_etapa_ab_implementation.md`

## Riesgos Pendientes

- La migracion nueva debe aplicarse antes de depender en produccion de `hr_vacation_import_batches` y de las columnas nuevas de `hr_vacation_movements`.
- No se valido contra Supabase produccion ni staging desde esta ejecucion.
- No se hizo deploy productivo.
- La siguiente fase de banco/nominas debe esperar a que Etapa A+B quede revisada y migrada en el entorno objetivo.

## Estado

Implementacion local completa y validada.
No hubo commit.
No hubo push.
No hubo deploy.
