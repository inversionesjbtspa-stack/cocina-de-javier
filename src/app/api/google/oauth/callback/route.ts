import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCodeForTokens } from "@/lib/google/oauth";

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_oauth_state"
      },
      { status: 400 }
    );
  }

  const tokens = await exchangeGoogleCodeForTokens(code);

  if (!tokens.refresh_token) {
    return new NextResponse(
      `<!doctype html>
      <html lang="es-CL">
        <head><meta charset="utf-8"><title>OAuth Google</title></head>
        <body style="font-family: Arial; padding: 32px;">
          <h1>No llego refresh_token</h1>
          <p>Google autorizo la cuenta, pero no devolvio refresh_token. Vuelve a iniciar con prompt=consent o revoca el acceso previo de la app y repite.</p>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const escapedToken = htmlEscape(tokens.refresh_token);

  return new NextResponse(
    `<!doctype html>
    <html lang="es-CL">
      <head>
        <meta charset="utf-8">
        <title>OAuth Google listo</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 32px; background: #f6f7f4; color: #18231c; }
          main { max-width: 840px; margin: 0 auto; background: white; border: 1px solid #dfe4dd; border-radius: 8px; padding: 24px; }
          code, textarea { width: 100%; box-sizing: border-box; font-family: Consolas, monospace; }
          textarea { min-height: 140px; margin-top: 12px; padding: 12px; }
          .warning { color: #7a3d00; background: #fff4df; border: 1px solid #f1d39c; padding: 12px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <main>
          <h1>Conexion Google autorizada</h1>
          <p>Guarda este valor como secreto <strong>GOOGLE_REFRESH_TOKEN</strong> en Vercel/Supabase. No lo subas al repositorio.</p>
          <textarea readonly>${escapedToken}</textarea>
          <p class="warning">Despues de guardarlo como secreto, cierra esta pagina. Trata este token como una contrasena.</p>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
