# Arquitectura inicial

## Objetivo

Construir un ERP administrativo cloud para La Cocina de Javier usando solo servicios gestionados:

- Next.js en Vercel para frontend y backend web serverless.
- Supabase para Auth, Postgres, Storage y RLS.
- Sin VPS ni servidor propio.

## Capas

```text
Next.js App Router
  UI administrativa
  Server Components
  Server Actions
  Route Handlers

Supabase
  Auth
  Postgres
  Row Level Security
  Storage privado

Vercel
  Hosting
  Preview deployments
  Cron liviano
  Variables de entorno
```

## Principios de implementacion

- Toda tabla sensible debe tener `tenant_id`, trazabilidad y RLS.
- El XML DTE original debe guardarse inmutable, con hash y metadata.
- Los procesos de pagos deben ser idempotentes y auditables.
- Los archivos bancarios deben versionarse y descargarse con permisos estrictos.
- Los reportes grandes deben generarse asincronicamente y quedar en Storage.

## Modulos base

1. Usuarios, roles y permisos.
2. Proveedores.
3. Productos.
4. Compras.
5. Facturas XML DTE.
6. PDF desde XML.
7. Cuentas por pagar.
8. Pagos masivos Santander.
9. Dashboard ejecutivo.
10. Reportes.
11. Auditoria y logs.
