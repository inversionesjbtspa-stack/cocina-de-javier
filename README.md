# Cocina de Javier ERP

Plataforma administrativa cloud para La Cocina de Javier.

## Stack

- Next.js App Router
- TypeScript
- Supabase Auth, Postgres y Storage
- Vercel

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm run lint
```

Ver prerequisitos locales en `docs/local-tooling.md`.

## Variables de entorno

Copiar `.env.example` a `.env.local` y configurar:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `DTE_INBOX_EMAIL`
- `DTE_INBOX_PROVIDER`
- `DTE_INBOX_AUTH_METHOD`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `DTE_IMAP_HOST`
- `DTE_IMAP_PORT`
- `DTE_IMAP_USER`
- `DTE_IMAP_APP_PASSWORD`

La `SUPABASE_SERVICE_ROLE_KEY` nunca debe exponerse al navegador.

## Seguridad base

La primera migracion Supabase esta en:

```text
supabase/migrations/202605150001_security_foundation.sql
```

El detalle del modelo de seguridad esta en `docs/security-foundation.md`.

## Nucleo administrativo

El paso 3 esta documentado en `docs/admin-core.md` e implementado en:

```text
supabase/migrations/202605150002_admin_core.sql
```

## Compras

El paso 4 esta documentado en `docs/purchasing-workflow.md` e implementado en:

```text
supabase/migrations/202605150003_purchasing_workflow.sql
```

## DTE y finanzas

Los pasos 5 y 6 estan documentados en:

```text
docs/dte-pdf.md
docs/finance-foundation.md
```

Migraciones:

```text
supabase/migrations/202605150004_dte_documents.sql
supabase/migrations/202605150005_finance_foundation.sql
```

## Automatizacion DTE

La sincronizacion automatica del buzon DTE esta documentada en:

```text
docs/dte-automation.md
```
