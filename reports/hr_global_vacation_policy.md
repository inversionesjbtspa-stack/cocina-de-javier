# Politica global de vacaciones RRHH

## Modelo anterior

Vacaciones dependia de `hr_employees.work_schedule`. Si el trabajador no tenia jornada, la ficha mostraba "Falta configurar jornada laboral" y el preview podia devolver `REVISAR_JORNADA_CONTRACTUAL`.

## Politica global implementada

Se agrego una fuente persistente por tenant en `hr_vacation_calendar_policies`:

- Lunes cerrado e inhabil.
- Martes a domingo laborables.
- Feriados oficiales laborables por defecto.
- 2 domingos libres mensuales programables por trabajador.
- Timezone `America/Santiago`.

La prioridad de calculo queda:

1. Override individual valido y explicitamente activado.
2. Politica global de empresa.
3. Error solo si no existe politica usable.

## Motor de calendario

Nuevo servicio: `src/lib/hr/vacation-calendar-server.ts`.

Funcion central: `resolveEmployeeWorkingCalendar(employeeId, fromDate, toDate)`.

Cada fecha resuelta informa:

- `date`
- `working`
- `reason`
- `source`

Razones implementadas:

- `MONDAY_CLOSED`
- `NORMAL_WORKING_DAY`
- `PUBLIC_HOLIDAY_WORKED`
- `SCHEDULED_SUNDAY_OFF`
- `COMPANY_CLOSED`

## Domingos libres

Nueva tabla: `hr_employee_monthly_days_off`.

Nueva UI: `RRHH -> Programacion / Domingos libres`.

Validaciones:

- maximo 2 fechas;
- deben pertenecer al mes;
- deben ser domingo;
- no pueden duplicarse para el mismo trabajador y fecha.

La carga masiva CSV/Excel quedo pendiente opcional para una fase posterior.

## Cierres extraordinarios

Nueva tabla: `hr_company_calendar_exceptions`.

Los cierres empresa se modelan como `COMPANY_CLOSED`, separados de feriados oficiales.

## Preview

El preview ahora muestra:

- Dias corridos.
- Dias a descontar.
- Lunes / cierres.
- Domingos libres programados.
- Feriados trabajados.
- Cierres extraordinarios.
- Saldo antes/despues.
- FIFO.

Se elimino `REVISAR_JORNADA_CONTRACTUAL` para trabajadores normales cuando aplica politica empresa.

## Comprobante

El campo historico "Dias habiles" usa `business_days`, es decir, los dias reales a descontar.

`Domingos e inhabiles` usa el total persistido de:

- lunes cerrados;
- domingos libres programados;
- cierres empresa.

Los feriados oficiales trabajados no se cuentan como inhabiles.

## Migracion

Archivo:

- `supabase/migrations/202608210001_hr_global_vacation_calendar_policy.sql`

Incluye:

- `hr_vacation_calendar_policies`
- `hr_company_calendar_exceptions`
- `hr_employee_monthly_days_off`
- indices;
- constraints;
- RLS;
- politicas por tenant;
- default inicial para tenants existentes;
- actualizacion de `hr_create_vacation_request(jsonb)` para persistir `non_business_days`.

## Validaciones ejecutadas

Node usado: runtime Node 24 del entorno Codex.

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: OK, 50 passed, 2 skipped
- `npm run build`: OK

Casos cubiertos en tests:

- lunes inhabil;
- martes habil;
- sabado habil;
- domingo habil por defecto;
- feriado oficial trabajado;
- domingo libre programado;
- rango lunes-domingo sin domingo libre = 6 dias descontables;
- rango lunes-domingo con domingo libre = 5 dias descontables;
- FIFO recibe la cantidad descontable;
- migracion aditiva con RLS;
- UI sin alerta obligatoria de jornada.

## Alcance no tocado

- Liquidaciones: intacto.
- Nominas: intacto.
- Banco/TEF: intacto.
- Trading: intacto.
- FIFO: se reutilizo sin modificar su motor.
- work_schedule historico: no se borro.

## Pendiente para produccion

No se aplico migracion en Supabase produccion desde esta sesion.
No se hizo push ni despliegue.
No se realizo validacion autenticada productiva.

Para produccion faltan:

1. Backup Supabase.
2. Dry-run/aplicacion controlada de migracion.
3. Push/merge segun flujo aprobado.
4. Deploy Production.
5. Validacion autenticada de Jesus Betancourt con preview 2026-08-17 a 2026-08-23.
