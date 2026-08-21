# Cierre vacaciones RRHH: calculo legal y feriado progresivo

Fecha: 2026-08-21

## Causa exacta de los 6 dias

El preview de vacaciones calculaba `businessDays` usando `calculateVacationBusinessDays(..., schedule)`.
Ese `schedule` venia desde `resolveEmployeeWorkingCalendar` y representaba la politica operacional de la empresa:

- lunes cerrado;
- martes a domingo laborables;
- domingos libres mensuales;
- feriados trabajados;
- cierres operacionales.

Esa politica operacional era correcta para turnos, pero no para feriado legal. Por eso el rango 24-08-2026 a 30-08-2026 descontaba 6 dias: martes, miercoles, jueves, viernes, sabado y domingo.

## Funcion corregida

- `src/lib/hr/vacation-domain.ts`
  - se agrego `calculateLegalVacationDays`;
  - `calculateVacationBusinessDays` ahora usa calendario legal de lunes a viernes;
  - `calculateVacationPreview` usa exclusivamente `daysToDeduct` legal para FIFO y saldo;
  - el calendario operacional queda disponible para auditoria/reincorporacion, pero no determina los dias a descontar.

## Nueva logica legal

Rango inclusivo `[startDate, endDate]`.

- lunes a viernes: habiles legales;
- sabado: inhabil;
- domingo: inhabil;
- feriado legal entre lunes y viernes: inhabil;
- dia inhabil manual entre lunes y viernes: inhabil;
- no se descuenta dos veces si un manual duplica un feriado oficial.

`daysToDeduct = legalWorkingDays`.

## Casos validados

- 24-08-2026 a 30-08-2026: 7 corridos, 5 habiles, 5 a descontar, 1 sabado, 1 domingo.
- martes a lunes siguiente: 5 a descontar.
- miercoles a martes siguiente: 5 a descontar.
- jueves a miercoles siguiente: 5 a descontar.
- viernes a jueves siguiente: 5 a descontar.
- sabado a domingo: 0 a descontar.
- feriado lunes-viernes dentro del rango: resta 1.
- feriado sabado: no resta dos veces.
- inhabil manual lunes-viernes: resta 1.
- inhabil manual duplicado con feriado oficial: no duplica.

## FIFO

FIFO recibe solamente `daysToDeduct`.

Caso validado:

- saldo periodo antiguo: 5;
- saldo periodo siguiente: 15;
- solicitud: 7 dias habiles;
- resultado: 5 dias contra el periodo antiguo y 2 contra el siguiente.

Para el caso 24-08-2026 a 30-08-2026 con saldo antes 120:

- dias a descontar: 5;
- saldo despues esperado: 115.

## Feriado progresivo

Se integro el trabajo local previo:

- `calculateProgressiveVacationDays`;
- endpoint administrativo `/api/hr/vacations/progressive`;
- UI de base/progresivo/total;
- migracion `202608210002_hr_progressive_vacation_article_68.sql`;
- reporte `reports/hr_progressive_vacation_article_68.md`.

Regla:

- 10, 11 y 12 anios computables: 0 progresivos;
- 13: 1;
- 16: 2;
- 19: 3;
- 22: 4;
- maximo 10 anios previos reconocidos.

No se inventa antiguedad previa.

## Comprobante

El comprobante usa los mismos `businessDays` legales persistidos en la solicitud.

Caso validado en tests:

- 24-08-2026 a 30-08-2026;
- dias habiles: 5;
- domingos e inhabiles: 2;
- saldo anterior: 120;
- saldo pendiente: 115.

## Migracion progresivo

Archivo:

- `supabase/migrations/202608210002_hr_progressive_vacation_article_68.sql`

Revision:

- aditiva;
- no elimina datos;
- no renombra estructuras;
- agrega constraints `NOT VALID` para evitar corte por datos legacy;
- limita `previous_employer_years` entre 0 y 10;
- impide `recognized_days` manual distinto de 0;
- mantiene `SECURITY DEFINER` con `search_path = public, pg_temp`;
- revoca `PUBLIC` y `anon`;
- concede a `authenticated` y `service_role`;
- valida tenant mediante `hr_employees`.

## Backup y Supabase

Backup reciente disponible:

- `reports/backups_before_hr_global_policy_prod/supabase_fkoc_prod_before_hr_global_policy_20260821_124913.sql`
- SHA256: `676FF367098CD4427387F47076BD6F87236B1E7F436B5B4D047A3D996FA06CE6`

Intento de nuevo dump con Supabase CLI: fallido porque Docker Desktop no esta disponible. El archivo vacio generado por ese intento fue eliminado.

Dry-run Supabase:

- pendiente solo `202608210002_hr_progressive_vacation_article_68.sql`.

## Validacion local

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- tests con Node 24.19.0: 56 passed, 2 skipped, 0 failed.
- `npm run build`: OK.

## Modulos no modificados

- Trading: intacto.
- Banco/TEF: intacto.
- Nominas: intacto.
- Liquidaciones: intacto.
- Pagos: intacto.

## Pendientes por completar en fases remotas

- aplicar migracion progresivo en Supabase si se mantiene autorizacion;
- push normal;
- deploy Production;
- validacion productiva autenticada del preview 24-08-2026 a 30-08-2026 sin confirmar vacaciones reales;
- auditoria visual del saldo de BETANCOURT PAREZ JESUS desde UI/DB productiva si existe acceso autenticado verificable.
