# Auditoria Datos Sueldos RRHH

Fecha: 2026-09-30
Repositorio: cocina-de-javier-rrhh-ficha-simple
Rama observada: feat/rrhh-bank-tef

## Alcance

Esta etapa fue solo de auditoria. No se implementaron nuevas funciones, no se escribieron datos productivos, no se aplicaron migraciones, no se hizo push, no se hizo deploy y no se modifico Trading.

Objetivo auditado:

- reorganizacion futura de RRHH en cuatro modulos principales: Trabajadores, Nominas, Datos Sueldos y Liquidaciones;
- conversion futura de Datos Sueldos en hoja mensual del contador;
- mapeo exacto de la plantilla Excel real;
- identificacion de datos automatizables desde el ERP;
- diagnostico de brechas antes de implementar.

## Estado del worktree antes de esta auditoria

Cambios preexistentes detectados:

- `src/app/api/hr/payment-template/route.ts`
- `src/components/hr/hr-dashboard-client.tsx`
- `src/lib/hr/bank-tef.ts`
- `tests/hr-module.test.ts`

Directorios/archivos no versionados preexistentes:

- `reports/backups_before_hr_bank_model_normalization/`
- `reports/backups_before_hr_global_policy_prod/`
- `reports/tef_outputs/`
- `reports/tef_preview_validation/`
- `reports/vacation_cancellation_failure_root_cause.md`
- `supabase/.temp/`
- `tmp/`

Este informe es el unico artefacto agregado en esta etapa.

## Plantilla real del contador

Plantilla canonica usada por el codigo:

- Archivo: `src/templates/rrhh/datos-sueldos-contador.xlsx`
- Hoja principal: `LIBRO REMUNERACIONES`
- Fila de encabezados: 5
- Primera fila de trabajadores: 6
- Columnas: A:V
- Hojas preservadas:
  - `LIBRO REMUNERACIONES`
  - `Bono produccion`
  - `RetencionCredito CAJA`
  - `asignacion familiar febrero 23`

La plantilla alternativa `src/templates/datos-sueldos-template.xlsx` existe, pero no es la plantilla canonica que usa actualmente `src/lib/hr/salary-export-map.ts`.

## Encabezados detectados en la plantilla canonica

| Columna | Encabezado Excel | Estado visual | Campo actual en codigo | Tipo esperado | Origen propuesto |
|---|---|---:|---|---|---|
| A | NOMBRE | visible | `fullName` | texto | automatico desde trabajador |
| B | RUT | visible | `rut` | texto | automatico desde trabajador |
| C | C. COSTO | visible | `costCenter` | texto | automatico desde ficha, editable |
| D | INASISTENCIAS | visible | `absences` | numero | manual o novedad mensual |
| E | MOTIVO | visible | `reason` | texto | manual |
| F | HORAS EXTRAS | visible | `overtimeHours` | numero | manual o novedad mensual |
| G | AGUINALDO | oculta | sin exportacion directa | numero | preservar plantilla |
| H | AGUINALDO | visible | sin exportacion directa | numero | pendiente de decision |
| I | BONO PRODUCCION | visible | `productionBonus` | numero | automatico desde bonos/novelties, editable |
| J | BONO COMP, | visible, ancho minimo | sin exportacion directa | numero | preservar plantilla |
| K | BONO COMP, | visible | `compensatoryBonus` | numero | automatico desde bonos/novelties, editable |
| L | RECARGO DOMINGO | visible | `sundaySurcharge` | numero | manual o novedad mensual |
| M | BONO RESPONSABILIDAD | visible | `responsibilityBonus` | numero | automatico desde bonos/novelties, editable |
| N | MOVILIZACION | visible | `movilization` | numero | ficha o manual |
| O | ASIG. TELEFONO | visible | `phoneAllowance` | numero | ficha o manual |
| P | CAJA | visible | `cashAllowance` | numero | manual |
| Q | ANTICIPOS | visible | `advances` | numero | automatico desde anticipos/pagos |
| R | ANTICIPO AGUINALDO | oculta | sin exportacion directa | numero | preservar plantilla |
| S | PTMO EMPRESA | visible | `companyLoan` | numero | manual o novedad mensual |
| T | PRESTAMO CAJA | visible | `ccafLoan` | numero | manual o novedad mensual |
| U | AGUINALDO | visible | `aguinaldo` | numero | automatico desde aguinaldos/novelties, editable |
| V | ANTICIPO AGUINALDO | visible | `advanceAguinaldo` solo export map | numero | pendiente de persistencia/UI |

Observaciones:

- `SALARY_HIDDEN_COLUMNS` conserva G, H y R como columnas especiales/ocultas segun el mapa, aunque la inspeccion del archivo muestra G y R ocultas y H visible.
- La plantilla canonica no incluye columna `LICENCIAS`; sin embargo, el modelo actual si tiene campo `licenses`.
- El modelo actual incluye `discounts`, pero la plantilla canonica A:V no tiene una columna explicita para descuentos.

## Codigo que genera/exporta Datos Sueldos

Archivos relevantes:

- `src/lib/hr/salary-export-map.ts`: define plantilla, columnas y hojas preservadas.
- `src/lib/hr/payroll-parser.ts`: genera y parsea workbook de Datos Sueldos.
- `src/lib/hr/salary-data.ts`: construye filas para UI/exportacion.
- `src/app/api/hr/accountant-data/route.ts`: exporta Excel y guarda fila individual.
- `src/app/api/hr/accountant-data/bulk/route.ts`: guarda filas en bloque.
- `supabase/migrations/202607230003_hr_payroll_hardening.sql`: RPC `hr_upsert_accountant_data_rows` y auditoria.

Estado actual:

- Se genera una fila por trabajador activo.
- Se conserva la plantilla canonica.
- Se conserva el formato basico y las hojas auxiliares.
- La exportacion ya mapea A:V, pero no todas las columnas de la plantilla tienen persistencia/UI clara.
- El guardado de filas usa RPC auditada.

## Automatizacion actual vs requerida

Automatizacion actual detectada:

- `advances` se toma desde la fila guardada de Datos Sueldos si existe.
- Si no existe valor manual, `advances` se calcula sumando `hr_payment_items` del periodo con `payment_type = anticipo`.

Brecha:

- Bonos de produccion, bonos compensatorios, bonos responsabilidad, aguinaldos, prestamos y otros conceptos no se integran todavia de forma completa a Datos Sueldos.
- `buildSalaryRows` recibe `monthlyNovelties`, pero actualmente no las usa para poblar las columnas.
- Los movimientos creados desde `monthly-novelties` se guardan/upsertean por tipo, no como eventos multiples trazables.
- La regla requerida "anticipo 10 sept + anticipo 20 sept = suma mensual con trazabilidad" no queda garantizada por el indice unico actual `(tenant_id, employee_id, period, novelty_type)`.
- La anulacion/reversion de novedades mensuales hacia payment items no esta consolidada.

## Anticipos, bonos y nominas

Fuentes actuales:

- `src/app/api/hr/advances/route.ts`: crea anticipos y payment items cuando corresponde.
- `src/app/api/hr/bonuses/route.ts`: crea bonos, pero puede traducirlos a tipos genericos (`bono_extra`/`ajuste`), lo que dificulta mapearlos con precision a columnas del contador.
- `src/app/api/hr/monthly-novelties/route.ts`: crea novedades mensuales y payment items para tipos pagables.
- `src/app/api/hr/payments/batch/route.ts`: crea lotes/nominas seleccionables.

Brechas:

- Datos Sueldos necesita una capa mensual consolidada por trabajador y periodo que distinga:
  - valores automaticos;
  - valores manuales;
  - fuente de cada monto;
  - anulaciones;
  - duplicados;
  - trazabilidad de movimientos multiples.
- Nominas y Datos Sueldos estan relacionados, pero no son lo mismo:
  - Nominas/pagos crean movimientos pagables.
  - Datos Sueldos debe ser la vista mensual del contador.
- La generacion bancaria TEF debe quedar separada de la preparacion contable.

## Navegacion RRHH actual

La navegacion principal actual en `src/components/hr/hr-dashboard-client.tsx` contiene siete entradas:

- Trabajadores
- Nominas
- Datos Sueldos
- Liquidaciones
- Programacion
- Importaciones
- Dashboard

La solicitud futura requiere dejar visibles solo cuatro modulos principales:

- Trabajadores
- Nominas
- Datos Sueldos
- Liquidaciones

Estado de la ficha del trabajador:

- Tabs actuales: Datos personales, Banco, Vacaciones, Liquidaciones.
- Esto ya coincide con la solicitud de no agregar Datos Sueldos dentro de la ficha individual.

Elementos a ocultar/reubicar en implementacion posterior:

- Programacion/Domingos libres como modulo principal.
- Importaciones como modulo principal.
- Dashboard como modulo principal.
- Accesos legacy/redundantes a vacaciones, papeletas, bancos/pagos, documentos, anticipos y bonos como entradas principales.

## Mensajes tecnicos visibles

Caso detectado:

- `src/app/api/hr/payments/batch/route.ts` devuelve `hr_payment_batch_invalid_rows`.
- La UI puede mostrar `payload.error` directamente.

Riesgo:

- El usuario puede ver un codigo tecnico en lugar de un mensaje operacional.

Mensaje futuro recomendado:

- "Hay trabajadores de la nomina que requieren revision antes de crear el lote."
- Detalle visible por fila: trabajador, problema, accion sugerida.

## Trabajadores CODEX VALIDACION RRHH

No se detecto una regla robusta y centralizada que excluya automaticamente trabajadores de prueba `CODEX VALIDACION RRHH` de operaciones productivas.

Recomendacion:

- No borrar esos registros.
- Agregar exclusion por flag tecnico/metadata si existe o se crea en una fase posterior.
- Evitar basarse solo en nombre visible para reglas productivas.

## Diagnostico principal

Datos Sueldos ya tiene una base tecnica usable:

- plantilla real identificada;
- exportador existente;
- guardado auditado;
- filas por trabajador activo;
- preservacion de formato Excel.

Pero aun no esta listo como hoja mensual completa del contador porque:

1. Solo anticipos tienen automatizacion parcial.
2. Bonos/aguinaldos/otros conceptos no alimentan todas las columnas del Excel.
3. Las novedades mensuales no se usan en `buildSalaryRows`.
4. La estructura actual de `hr_monthly_novelties` no soporta bien multiples movimientos del mismo tipo en un periodo.
5. Hay columnas de plantilla sin decision funcional clara: H, J, R, V.
6. Hay campos del modelo sin columna canonica clara: `licenses`, `discounts`.
7. La UI de RRHH todavia expone modulos que deben ocultarse/reorganizarse.
8. Algunos errores tecnicos pueden mostrarse al usuario.

## Mapa recomendado para implementacion posterior

Datos Sueldos deberia construirse como snapshot mensual por trabajador:

- base: trabajadores activos del periodo;
- valores maestros: nombre, RUT, centro de costo;
- valores automaticos: anticipos, aguinaldos, bonos, prestamos y conceptos generados por ERP;
- valores manuales: inasistencias, motivo, horas extras y ajustes que el contador complete;
- trazabilidad: cada valor automatico debe apuntar a sus movimientos fuente;
- auditoria: guardar antes/despues por campo;
- exportacion: conservar exactamente `datos-sueldos-contador.xlsx`.

Para cada concepto automatico:

- sumar movimientos confirmados del periodo;
- excluir anulados;
- registrar fuente;
- evitar duplicados por `source_id`;
- recalcular al anular/revertir;
- permitir override manual con trazabilidad clara.

## Decision antes de implementar

Antes de tocar codigo se deben resolver estas decisiones:

1. Confirmar si columna H visible `AGUINALDO` se debe usar o conservar vacia.
2. Confirmar si columna J `BONO COMP,` de ancho minimo debe conservarse vacia o mapearse.
3. Confirmar si columna V `ANTICIPO AGUINALDO` debe tener UI/persistencia.
4. Confirmar que `LICENCIAS` y `DESCUENTOS` no se exportan en la plantilla canonica actual o definir columna destino.
5. Definir si `hr_monthly_novelties` debe evolucionar de "una fila por tipo/mes" a "movimientos multiples con agrupacion mensual".
6. Definir exclusion tecnica de trabajadores de validacion antes de operaciones productivas.

## Conclusion

La plantilla del contador fue identificada y mapeada. La implementacion siguiente debe ser una refactorizacion controlada de UX y agregacion mensual, no un cambio de base legal ni de modulos ajenos.

No se recomienda implementar sin resolver las columnas ambiguas H/J/V y la trazabilidad de movimientos multiples.
