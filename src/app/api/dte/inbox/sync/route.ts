import { NextResponse } from "next/server";
import { fetchDteXmlAttachments } from "@/lib/dte/gmail-client";
import { dteInboxConfig, hasDteImapConfig, hasGoogleOAuthConfig } from "@/lib/dte/inbox";
import { fetchDteXmlAttachmentsViaImap } from "@/lib/dte/imap-client";
import { parseDteXml } from "@/lib/dte/parser";
import { persistExtractedDteInvoices } from "@/lib/dte/persist";

export async function POST(request: Request) {
  try {
    if (dteInboxConfig.authMethod === "imap" && !hasDteImapConfig()) {
      return NextResponse.json(
        {
          ok: false,
          error: "imap_not_configured",
          message:
            "Configure DTE_IMAP_HOST, DTE_IMAP_PORT, DTE_IMAP_USER and DTE_IMAP_APP_PASSWORD to sync dte@lacocinadejavier.cl."
        },
        { status: 409 }
      );
    }

    if (dteInboxConfig.authMethod === "oauth" && !hasGoogleOAuthConfig()) {
      return NextResponse.json(
        {
          ok: false,
          error: "google_oauth_not_configured",
          message:
            "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN to sync dte@lacocinadejavier.cl."
        },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      maxResults?: number;
    };
    const attachments =
      dteInboxConfig.authMethod === "imap"
        ? await fetchDteXmlAttachmentsViaImap()
        : await fetchDteXmlAttachments({
            maxResults: body.maxResults ?? 20
          });

    const parsed = [];
    const rejected = [];

    for (const attachment of attachments) {
      try {
        parsed.push({
          invoice: parseDteXml({
            xml: attachment.xml,
            sourceMessageId: attachment.messageId,
            sourceAttachmentId: attachment.attachmentId,
            sourceFilename: attachment.filename
          }),
          xml: attachment.xml
        });
      } catch (error) {
        rejected.push({
          filename: attachment.filename,
          message: error instanceof Error ? error.message : "Unknown XML parse error"
        });
      }
    }

    const persisted = parsed.length ? await persistExtractedDteInvoices(parsed) : [];

    return NextResponse.json({
      ok: true,
      source: "dte@lacocinadejavier.cl",
      found: attachments.length,
      count: parsed.length,
      rejected,
      persisted,
      invoices: parsed.map((item) => item.invoice)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "dte_sync_failed",
        message: error instanceof Error ? error.message : "Unknown DTE sync error"
      },
      { status: 500 }
    );
  }
}
