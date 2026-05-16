# Automatizacion DTE

## Objetivo

Actualizar automaticamente el ERP cuando llegan XML al buzon:

```text
dte@lacocinadejavier.cl
```

## Estrategia cloud

Sin VPS ni servidor propio, la opcion robusta es polling con Vercel Cron:

```text
Vercel Cron cada 5 minutos
  -> GET /api/cron/dte-sync
  -> IMAP Gmail
  -> descargar XML nuevos
  -> parsear DTE
  -> guardar/actualizar facturas por idempotencyKey
  -> actualizar vista Compras
```

## Endpoint

```text
GET /api/cron/dte-sync
```

Proteccion:

```text
Authorization: Bearer CRON_SECRET
```

## Variables requeridas

```text
CRON_SECRET
DTE_INBOX_AUTH_METHOD=imap
DTE_IMAP_HOST=imap.gmail.com
DTE_IMAP_PORT=993
DTE_IMAP_USER=dte@lacocinadejavier.cl
DTE_IMAP_APP_PASSWORD
```

## Idempotencia

Cada XML se identifica por:

```text
rutEmisor + tipoDte + folio + xmlSha256
```

Esto evita duplicar facturas si el cron procesa el mismo correo mas de una vez.
