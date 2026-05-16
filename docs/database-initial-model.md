# Modelo inicial de base de datos

## Seguridad y organizacion

```text
tenants
companies
branches
profiles
roles
permissions
user_memberships
role_permissions
```

## Proveedores y productos

```text
suppliers
supplier_contacts
supplier_bank_accounts
supplier_documents
products
product_categories
product_supplier_links
product_price_history
```

Implementado en `supabase/migrations/202605150002_admin_core.sql`.

## Compras

```text
cost_centers
purchase_requests
purchase_request_items
purchase_approvals
purchase_orders
purchase_order_items
goods_receipts
goods_receipt_items
purchase_documents
```

Implementado en `supabase/migrations/202605150003_purchasing_workflow.sql`.

## DTE y documentos

```text
dte_documents
dte_xml_files
dte_items
dte_references
dte_validation_results
dte_pdf_files
```

Implementado en `supabase/migrations/202605150004_dte_documents.sql`.

## Finanzas

```text
accounts_payable
payment_batches
payment_batch_items
payment_approvals
payment_files
bank_reconciliation_entries
budgets
budget_lines
financial_periods
report_exports
v_financial_dashboard
```

Implementado en `supabase/migrations/202605150005_finance_foundation.sql`.

## Control

```text
audit_events
integration_events
idempotency_keys
system_logs
report_exports
```
