# DTE y PDF

## Alcance del paso 5

Este paso agrega la base para facturas XML DTE chilenas:

- Registro principal de DTE.
- XML original inmutable en Storage.
- Items del documento.
- Referencias tributarias.
- Resultados de validacion.
- PDFs generados desde XML.
- Idempotencia por documento.
- Preparacion para matching contra OC y recepcion.

## Migracion

```text
supabase/migrations/202605150004_dte_documents.sql
```

## Reglas criticas

- No duplicar por `tenant_id + rut_emisor + tipo_dte + folio`.
- Guardar hash SHA-256 del XML.
- Mantener XML original sin modificar.
- Registrar resultados de validacion por validador.
- Versionar PDF generado en Storage.

## Buckets usados

```text
dte-xml-originals
dte-pdf-rendered
```

## Buzon DTE

Correo funcional de recepcion:

```text
dte@lacocinadejavier.cl
```

Proveedor detectado por registros MX:

```text
Google Workspace / Gmail
```

Consulta objetivo para XML:

```text
to:dte@lacocinadejavier.cl has:attachment filename:xml -in:trash -in:spam
```

La clave normal del correo no debe guardarse en el repositorio. La ruta simple configurada usa IMAP de Gmail con contraseña de aplicación y guarda `DTE_IMAP_APP_PASSWORD` como secreto de Vercel o Supabase, nunca en Git.

## Extraccion implementada

Endpoint:

```text
POST /api/dte/inbox/sync
```

Flujo:

```text
IMAP Gmail
  -> buscar XML adjuntos
  -> descargar mensaje
  -> parsear XML DTE
  -> devolver facturas extraidas
```

Archivos:

```text
src/lib/dte/gmail-client.ts
src/lib/dte/imap-client.ts
src/lib/dte/parser.ts
src/lib/dte/types.ts
src/app/api/dte/inbox/sync/route.ts
src/lib/google/oauth.ts
src/app/api/google/oauth/start/route.ts
src/app/api/google/oauth/callback/route.ts
```

Campos extraidos:

```text
tipoDte
folio
rutEmisor
razonSocialEmisor
rutReceptor
razonSocialReceptor
fechaEmision
montoNeto
montoExento
iva
montoTotal
items
xmlSha256
idempotencyKey
```

## Flujo OAuth implementado

1. Configurar secretos:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
```

2. Abrir:

```text
/api/google/oauth/start
```

3. Iniciar sesion con:

```text
dte@lacocinadejavier.cl
```

4. Copiar el token devuelto y guardarlo como:

```text
GOOGLE_REFRESH_TOKEN
```

5. Ejecutar:

```text
POST /api/dte/inbox/sync
```

## Flujo IMAP recomendado

Secretos:

```text
DTE_INBOX_AUTH_METHOD=imap
DTE_IMAP_HOST=imap.gmail.com
DTE_IMAP_PORT=993
DTE_IMAP_USER=dte@lacocinadejavier.cl
DTE_IMAP_APP_PASSWORD=<app password de Google>
```

Ejecucion:

```text
POST /api/dte/inbox/sync
```
