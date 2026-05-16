# Finanzas base

## Alcance del paso 6

Este paso agrega la base financiera:

- Cuentas por pagar.
- Lotes de pago Santander.
- Items de lote.
- Archivos bancarios versionados.
- Presupuestos.
- Lineas de presupuesto.
- Exportaciones de reportes.
- Vista base de dashboard financiero.

## Migracion

```text
supabase/migrations/202605150005_finance_foundation.sql
```

## Flujo

```text
DTE validado
  -> cuenta por pagar
  -> aprobacion financiera
  -> lote de pago Santander
  -> archivo bancario en Storage
  -> conciliacion futura
```

## Vista inicial

```sql
public.v_financial_dashboard
```

Entrega cuentas por pagar abiertas, saldo abierto, monto vencido, IVA credito del mes y vencimientos proximos.

## Buckets usados

```text
payment-files
report-exports
```
