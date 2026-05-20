import { NextResponse } from "next/server";
import { dteInboxConfig, hasDteImapConfig, hasGoogleOAuthConfig, DTE_XML_GMAIL_QUERY } from "@/lib/dte/inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const usingImap = dteInboxConfig.authMethod === "imap";
  const configured = usingImap ? hasDteImapConfig() : hasGoogleOAuthConfig();

  return NextResponse.json(
    {
      ok: configured,
      provider: dteInboxConfig.provider,
      authMethod: dteInboxConfig.authMethod,
      inbox: dteInboxConfig.email,
      query: DTE_XML_GMAIL_QUERY,
      configured,
      checkedAt: new Date().toISOString()
    },
    { status: configured ? 200 : 503 }
  );
}
