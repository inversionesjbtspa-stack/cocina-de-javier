# Nucleo administrativo

## Alcance del paso 3

Este paso agrega la base operativa para:

- Empresas y sucursales.
- Proveedores.
- Cuentas bancarias de proveedores.
- Documentos de proveedores.
- Categorias de productos.
- Productos.
- Vinculo producto-proveedor.
- Historial de precios.
- Buckets privados para XML, PDF, adjuntos, pagos y reportes.

## Migracion

Archivo:

```text
supabase/migrations/202605150002_admin_core.sql
```

## Storage

Buckets creados:

```text
dte-xml-originals
dte-pdf-rendered
purchase-attachments
payment-files
report-exports
```

Convencion de rutas:

```text
{tenant_id}/{entity}/{entity_id}/{file_name}
```

Las politicas de Storage leen el primer segmento de la ruta como `tenant_id`.

## Validaciones compartidas

Archivo:

```text
src/lib/admin-core/schemas.ts
```

Incluye validacion inicial para:

- RUT chileno sin puntos y con guion.
- proveedor.
- cuenta bancaria proveedor.
- producto.
- historial de precios.

## RLS

Reglas principales:

- Los miembros activos leen proveedores/productos de su tenant.
- `owner`, `admin` y `procurement_manager` administran proveedores/productos.
- Finanzas y contabilidad pueden leer cuentas bancarias.
- Archivos de pago solo los leen/suben roles financieros autorizados.
