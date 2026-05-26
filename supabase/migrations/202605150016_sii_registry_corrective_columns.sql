alter table if exists public.sii_purchase_registry
  add column if not exists proveedor text;

update public.sii_purchase_registry
set proveedor = razon_social
where proveedor is null and razon_social is not null;
