# Seguridad base

## Alcance del paso 2

Este paso agrega la base de seguridad para convertir el proyecto en un ERP real:

- Supabase Auth como identidad principal.
- Perfiles en `public.profiles`.
- Modelo multi-tenant con `tenants`, `companies` y `branches`.
- Roles administrativos tipados con `public.app_role`.
- Permisos versionables en tabla.
- Membresias por tenant/empresa/sucursal.
- RLS habilitado en tablas sensibles.
- Auditoria append-only inicial.
- Tabla de idempotencia para procesos criticos.
- Login server-side con Supabase SSR.

## Migracion

Archivo:

```text
supabase/migrations/202605150001_security_foundation.sql
```

La migracion crea:

```text
tenants
companies
branches
profiles
permissions
role_permissions
user_memberships
audit_events
idempotency_keys
```

Tambien crea funciones auxiliares:

```text
public.handle_new_user()
public.current_user_has_role()
public.current_user_is_member()
public.set_updated_at()
```

## Politicas RLS

Reglas iniciales:

- Un usuario solo lee tenants donde tiene membresia activa.
- `owner` y `admin` administran tenants, empresas, sucursales y usuarios.
- Roles financieros pueden leer idempotencia de procesos criticos.
- Auditoria se lee solo por `owner`, `admin` y `auditor`.
- Insercion de auditoria e idempotencia operativa queda reservada para service role.

## Bootstrap recomendado

Despues de aplicar la migracion, crear manualmente el primer tenant y asignar el primer owner desde Supabase SQL Editor usando un usuario ya registrado.

Ejemplo conceptual:

```sql
insert into public.tenants (name, slug)
values ('La Cocina de Javier', 'la-cocina-de-javier');

insert into public.companies (tenant_id, legal_name, trade_name, rut)
values ('TENANT_ID', 'RAZON SOCIAL', 'La Cocina de Javier', 'RUT');

insert into public.user_memberships (tenant_id, company_id, user_id, role)
values ('TENANT_ID', 'COMPANY_ID', 'USER_ID', 'owner');
```

No usar usuarios de prueba en produccion.
