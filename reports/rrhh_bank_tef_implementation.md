# Implementacion Banco RRHH y Nominas TEF

## Alcance

Se implemento exclusivamente el bloque Banco de RRHH y el flujo de generacion de nominas bancarias TEF. No se modifico Trading, Vacaciones, Liquidaciones, Banco/TEF de proveedores, pagos productivos, Cloudflare ni logica de calculo de liquidaciones.

## Fuente inicial

Archivo revisado en modo solo lectura:

`C:\Users\Usuario\Desktop\DOCUMENTOS JESÚS\BANCO\REMUNERACIONES\2026\AGOSTO\nomina codex.xlsx`

Resultado de lectura:

- Hoja seleccionada: `Hoja2`
- Motivo: contiene la estructura administrativa de datos bancarios con `Propietario real de la cuenta`.
- Filas detectadas: 29
- Filas con RUT: 29
- Filas con cuenta destino: 29
- Filas con correo: 29
- Cuentas con propietario real distinto del nombre beneficiario/glosa: 10

La hoja historica `Hoja1` queda como referencia de formato TEF, pero no como fuente principal para poblar datos bancarios.

## Importacion bancaria

Archivo principal:

- `src/lib/hr/bank-tef.ts`
- `src/app/api/hr/bank-import/route.ts`

Cambios:

- Parser `.xlsx` para hojas de datos bancarios.
- Compatibilidad legacy con parser `.xls` existente.
- Asociacion exclusivamente por RUT normalizado.
- Eliminado match automatico por nombre.
- Preview por defecto, sin escritura productiva.
- Tipo de cuenta queda `null` / `POR REVISAR` cuando no viene en la fuente.
- Cuentas de tercero quedan como `CUENTA DE TERCERO / REVISAR`, no se bloquean automaticamente.
- Estados de preview: LISTO, TRABAJADOR NO ENCONTRADO, RUT DUPLICADO, CUENTA DUPLICADA, DATOS INCOMPLETOS, CAMBIO DE CUENTA, YA EXISTE SIN CAMBIOS y CUENTA DE TERCERO / REVISAR.

## Ficha Banco del trabajador

Archivos:

- `src/lib/hr/data.ts`
- `src/app/api/hr/employees/[id]/route.ts`
- `src/components/hr/hr-dashboard-client.tsx`

Campos agregados a la presentacion:

- Propietario real de la cuenta.
- Glosa TEF beneficiario.
- Estado de revision.

La ficha permite revisar manualmente tipo de cuenta, titular, RUT titular, propietario real y correo de pago.

## Nomina bancaria TEF

Archivos:

- `src/lib/hr/bank-tef.ts`
- `src/app/api/hr/payment-template/route.ts`
- `src/components/hr/hr-dashboard-client.tsx`

Formato generado:

- Workbook `.xlsx`
- Hoja: `PAGO`
- Columnas exactas A:K:
  - Cta_origen
  - moneda_origen
  - Cta_destino
  - moneda_destino
  - Cod_banco
  - RUT benef.
  - nombre benef.
  - Mto Total
  - Glosa TEF
  - Correo
  - Glosa correo

Configuracion fija de origen:

- Cta_origen: `71068862`
- Moneda origen: `CLP`
- Moneda destino: `CLP`

El flujo ahora separa:

1. Previsualizar TEF.
2. Descargar TEF Banco.

La descarga crea un lote con estado `archivo_generado` y snapshot de datos bancarios. No marca pagos como pagados.

## Snapshot y migracion

Migracion creada:

- `supabase/migrations/202609060001_hr_bank_tef_batches.sql`

Caracteristicas:

- Aditiva.
- No elimina tablas ni columnas.
- No renombra estructuras.
- Agrega `real_owner_name`, `review_status`, `reviewed_at`.
- Agrega snapshot TEF en `hr_payment_batch_items`.
- Agrega indice de revision bancaria.
- Agrega indice GIN para snapshot.
- Agrega idempotencia por `payment_item_id` activo.
- Mantiene RLS habilitado.

No fue aplicada a produccion durante esta tarea.

## Validaciones

Comandos ejecutados:

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: 69 pass, 2 skipped, 0 failed
- `npm run build`: OK

Pruebas nuevas:

- XLSX `Hoja2` se parsea correctamente.
- Asociacion bancaria usa solo RUT.
- Nombre no genera match automatico si el RUT no coincide.
- Cuentas de tercero quedan en revision.
- Montos cero quedan excluidos como `SIN PAGO / $0`.
- Banco incompleto bloquea exportacion.
- Workbook TEF usa hoja `PAGO`.
- Workbook TEF usa dimension `A1:K`.
- Workbook TEF no genera columnas L en adelante.

## Confirmaciones

- No se subio archivo al banco.
- No se marcaron pagos como pagados.
- No se escribio en Supabase productivo.
- No se modificaron liquidaciones.
- No se modificaron vacaciones.
- No se modifico Trading.
- No se modifico Cloudflare.

## Estado

Preview de carga inicial listo para autorizacion.
Generacion TEF implementada con validacion previa y snapshot congelado.
