# Flujo de compras

## Alcance del paso 4

Este paso agrega la base operativa para:

- Centros de costo.
- Solicitudes de compra.
- Items de solicitud.
- Aprobaciones de solicitud.
- Ordenes de compra.
- Items de OC.
- Recepciones de mercaderia.
- Items de recepcion.
- Adjuntos de compras.

## Migracion

Archivo:

```text
supabase/migrations/202605150003_purchasing_workflow.sql
```

## Flujo

```text
Solicitud de compra
  -> aprobacion
  -> orden de compra
  -> recepcion parcial o total
  -> matching futuro contra DTE
  -> cuenta por pagar
```

## Funcion transaccional

La funcion:

```sql
public.post_goods_receipt(target_receipt_id uuid)
```

Hace:

- Verifica que la recepcion exista y este en borrador.
- Verifica permisos del usuario autenticado.
- Impide recibir mas cantidad que la OC.
- Suma cantidades recibidas en `purchase_order_items`.
- Marca la recepcion como `posted`.
- Actualiza la OC a `partially_received` o `received`.

## RLS

Reglas principales:

- Miembros activos leen datos de compra de su tenant.
- `owner`, `admin`, `procurement_manager`, `buyer` y `store_manager` gestionan solicitudes y recepciones.
- Solo `owner`, `admin` y `procurement_manager` gestionan ordenes de compra.
- Aprobaciones quedan limitadas a roles gerenciales de compras/finanzas.

## Preparado para paso siguiente

El modelo deja referencias suficientes para que el siguiente paso implemente:

- Facturas XML DTE.
- Matching DTE contra OC y recepcion.
- Diferencias de precio/cantidad.
- Creacion de cuentas por pagar.
