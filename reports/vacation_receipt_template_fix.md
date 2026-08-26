# Correccion comprobante de feriado RRHH

## Alcance

- Rama: `fix/rrhh-vacation-receipt-template`
- Cambio limitado a renderer del comprobante de feriado, ruta de vista previa/PDF y consulta de allocations FIFO para presentacion.
- No se modificaron calculos de vacaciones, FIFO, saldos, movimientos, solicitudes, feriado progresivo, liquidaciones, nominas, Banco/TEF, pagos, trading ni Cloudflare.

## Causa visual

El comprobante generado por ERP usaba un diseno tipo reporte/dashboard: bloques con relleno, cajas, tablas modernas y layout vertical. La plantilla historica adjunta es un formulario administrativo simple, blanco, sobrio, con encabezado de empresa, titulo centrado, periodo contractual, texto legal, detalle de feriado y firmas.

Ademas, el periodo contractual podia aparecer como `No informado` cuando la solicitud no tenia `contract_period_start/end`, aunque el FIFO real ya existia en `hr_vacation_allocations`.

En validacion productiva del primer deploy se detecto otro problema de presentacion: el snapshot historico de la solicitud conservaba `company: Empresa`, por lo que la vista previa podia imprimir empresa generica aunque existiera configuracion viva en `companies`. Se corrigio la prioridad para usar primero la configuracion actual de empresa y dejar el snapshot solo como respaldo.

## Archivos modificados

- `src/lib/hr/vacation-receipt.ts`
- `src/lib/hr/vacation-server.ts`
- `src/app/api/hr/vacations/[id]/papeleta/route.ts`
- `tests/hr-module.test.ts`

## Solucion aplicada

- El HTML y PDF ahora comparten la misma estructura administrativa:
  - encabezado de razon social, RUT, direccion y telefono;
  - fecha de emision y numero de comprobante;
  - titulo `COMPROBANTE DE FERIADO`;
  - periodo contractual `Del ... Al ...`;
  - texto legal introductorio;
  - trabajador en linea simple con RUT discreto;
  - descanso efectivo `DESDE EL ... AL ...`;
  - detalle del feriado con columna `DIAS`;
  - firmas de empleador y trabajador;
  - nota legal sin marcas de prueba ni watermark.

- El renderer PDF se cambio a A4 horizontal, fondo blanco y texto negro, sin cajas coloreadas tipo dashboard.
- La ruta de comprobante y la regeneracion persistida consultan `hr_vacation_allocations` y `hr_vacation_periods` para usar el periodo FIFO real si la solicitud no trae periodo contractual directo.
- `fractionalVacationLabel` ahora siempre imprime `Si` o `No`, evitando campos vacios.
- La configuracion viva de empresa tiene prioridad sobre snapshots historicos incompletos.

## Caso validado

Caso esperado para `FER-2026-000001`:

- Trabajador: BETANCOURT PAREZ JESUS
- Periodo FIFO: 28/07/2020 al 27/07/2021
- Descanso: 17/08/2026 al 23/08/2026
- Dias habiles: 5
- Vac. progresivas: 0
- Domingos e inhabiles: 2
- Saldo pendiente: 115
- Feriado fraccionado: No

## Evidencia visual local

- Referencia renderizada desde DOCX: `tmp/vacation_receipt_template/reference_png/page-1.png`
- Muestra generada: `tmp/vacation_receipt_template/generated_jesus.pdf`
- Muestra rasterizada: `tmp/vacation_receipt_template/generated_jesus.png`

## Pruebas

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test`: OK, 60 pass, 2 skipped
- `npm run build`: OK

## Regeneracion productiva

Pendiente de ejecutar despues de deploy Production Ready:

- regenerar exclusivamente `FER-2026-000001`;
- validar que no se crea una nueva solicitud;
- validar que no se crea un nuevo movimiento;
- validar descuento unico de 5 dias;
- validar saldo permanece 115.
