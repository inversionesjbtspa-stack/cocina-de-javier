# Feriado progresivo RRHH - Articulo 68

Fecha: 2026-08-21

## Alcance

Se corrigio exclusivamente el motor de vacaciones RRHH para calcular el feriado progresivo conforme al articulo 68 del Codigo del Trabajo de Chile.

No se modifico Trading, Banco, TEF, Nominas, Liquidaciones ni Pagos.

## Fuentes documentadas

- Codigo del Trabajo, articulo 67: feriado anual base de 15 dias habiles.
- Codigo del Trabajo, articulo 68: un dia adicional por cada tres nuevos anios trabajados despues de completar diez anios para uno o mas empleadores; solo pueden hacerse valer hasta diez anios con empleadores anteriores.
- Direccion del Trabajo, "En que consiste el derecho al feriado progresivo": https://www.dt.gob.cl/portal/1628/w3-article-60194.html
- Direccion del Trabajo, "Como se acreditan los anios trabajados para los efectos del feriado progresivo": https://www.dt.gob.cl/portal/1628/w3-article-60195.html
- Direccion del Trabajo, ORD. N 396, 21-06-2024: https://www.dt.gob.cl/legislacion/1624/w3-article-126360.html

## Regla implementada

El feriado base se mantiene en 15 dias habiles.

Los anios previos reconocidos:

- deben registrarse administrativamente;
- deben estar entre 0 y 10;
- no reemplazan el requisito de antiguedad ordinaria con el empleador actual;
- solo sirven para el calculo progresivo.

Formula:

```ts
totalRecognizedYears = currentEmployerServiceYears + recognizedPreviousServiceYears

if totalRecognizedYears < 13:
  progressiveDays = 0
else:
  progressiveDays = floor((totalRecognizedYears - 10) / 3)
```

No se usa redondeo hacia arriba.

No se permite la regla incorrecta "despues de 10 anios se agregan 2 dias por anio".

## Cambios realizados

- `src/lib/hr/vacation-domain.ts`
  - agrega `calculateProgressiveVacationDays`;
  - corrige `calculateProgressiveDays`;
  - elimina el uso de `recognizedDays` como atajo manual;
  - separa `baseDays=15` y `progressiveDays=X` en periodos generados.

- `src/lib/hr/vacation-server.ts`
  - mapea registros de `hr_vacation_progressive_records`;
  - usa registros acreditados al crear periodos faltantes.

- `src/app/api/hr/vacations/preview/route.ts`
  - lee registros progresivos acreditados y los pasa al motor de preview.

- `src/app/api/hr/vacations/route.ts`
  - usa la misma fuente de registros progresivos al confirmar vacaciones.

- `src/app/api/hr/vacations/progressive/route.ts`
  - agrega endpoint administrativo protegido para registrar anios previos reconocidos;
  - valida 0 a 10 anios;
  - registra auditoria;
  - no crea movimientos artificiales.

- `src/lib/hr/data.ts`
  - expone registros progresivos al dashboard.

- `src/components/hr/vacation-components.tsx`
  - muestra Feriado base, Feriado progresivo y Total del periodo;
  - muestra tabla por periodo con Base, Progresivos, Total, Utilizados y Pendientes;
  - agrega detalle administrativo para acreditacion.

- `src/components/hr/hr-dashboard-client.tsx`
  - integra el detalle de feriado progresivo en Detalle/Auditoria.

- `supabase/migrations/202608210002_hr_progressive_vacation_article_68.sql`
  - agrega restricciones idempotentes para nuevos registros;
  - limita anios previos a 0-10;
  - impide `recognized_days` manuales distintos de 0;
  - reemplaza RPC legacy con `search_path` seguro y grants minimos.

## Tests agregados

Se agregaron casos para:

- 9 anios total -> 0 progresivos;
- 10 anios total -> 0;
- 12 anios total -> 0;
- 13 anios total -> 1;
- 15 anios total -> 1;
- 16 anios total -> 2;
- 19 anios total -> 3;
- maximo 10 anios anteriores reconocidos;
- rechazo de 11 anios anteriores;
- 9 anteriores + 4 empresa -> 1;
- 10 anteriores + 3 empresa -> 1;
- recalculo al cambiar fecha de consulta;
- preview sin movimientos artificiales;
- FIFO con dias progresivos disponibles.

## Validacion

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: OK, 54 passed, 2 skipped
- `npm run build`: OK

## Produccion

No se aplico migracion en Supabase produccion.

No se hizo push.

No se desplego Vercel.
