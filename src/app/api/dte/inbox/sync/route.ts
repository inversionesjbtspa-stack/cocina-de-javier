import { NextResponse } from "next/server";
import { fetchDteXmlAttachments } from "@/lib/dte/gmail-client";
import { DTE_XML_GMAIL_QUERY, dteInboxConfig, hasDteImapConfig, hasGoogleOAuthConfig } from "@/lib/dte/inbox";
import { fetchDteXmlAttachmentsViaImap } from "@/lib/dte/imap-client";
import { parseDteXml } from "@/lib/dte/parser";
import { persistExtractedDteInvoices } from "@/lib/dte/persist";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function isSessionAuthorized() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return Boolean(user);
}

function isCronAuthorized(request: Request) {
  return Boolean(
    serverEnv.CRON_SECRET &&
      request.headers.get("authorization") === `Bearer ${serverEnv.CRON_SECRET}`
  );
}

async function runSync(maxResults = 50) {
  if (dteInboxConfig.authMethod === "imap" && !hasDteImapConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error: "imap_not_configured",
        message: "Configure DTE_IMAP_HOST, DTE_IMAP_PORT, DTE_IMAP_USER and DTE_IMAP_APP_PASSWORD."
      },
      { status: 409 }
    );
  }

  if (dteInboxConfig.authMethod === "oauth" && !hasGoogleOAuthConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error: "google_oauth_not_configured",
        message: "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN."
      },
      { status: 409 }
    );
  }

  const attachments =
    dteInboxConfig.authMethod === "imap"
      ? await fetchDteXmlAttachmentsViaImap()
      : await fetchDteXmlAttachments({ maxResults });

  const parsed = [];
  const rejected = [];

  for (const attachment of attachments) {
    try {
      parsed.push({
        invoice: parseDteXml({
          sourceAttachmentId: attachment.attachmentId,
          sourceFilename: attachment.filename,
          sourceMessageId: attachment.messageId,
          sourceReceivedAt: attachment.receivedAt,
          sourceSender: attachment.sender,
          sourceSubject: attachment.subject,
          sourceThreadId: attachment.threadId,
          xml: attachment.xml
        }),
        xml: attachment.xml
      });
    } catch (error) {
      rejected.push({
        attachmentId: attachment.attachmentId,
        fileName: attachment.filename,
        messageId: attachment.messageId,
        reason: error instanceof Error ? error.message : "Unknown XML parse error"
      });
    }
  }

  const persisted = parsed.length ? await persistExtractedDteInvoices(parsed) : [];
  const duplicated = persisted.filter((item) => item.duplicate).length;
  const created = persisted.length - duplicated;

  if (rejected.length) {
    const supabase = createAdminClient();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", "la-cocina-de-javier")
      .maybeSingle();
    await supabase.from("dte_processing_errors").insert(
      rejected.map((item) => ({
        error_code: "xml_parse_failed",
        filename: item.fileName,
        gmail_attachment_id: item.attachmentId,
        gmail_message_id: item.messageId,
        message: item.reason,
        raw_metadata: item,
        tenant_id: tenant?.id ?? null
      }))
    );
  }

  return NextResponse.json({
    ok: true,
    source: dteInboxConfig.email,
    query: DTE_XML_GMAIL_QUERY,
    syncedAt: new Date().toISOString(),
    found: attachments.length,
    processed: parsed.length,
    new: created,
    duplicated,
    rejected: rejected.length,
    errors: rejected,
    totalPersisted: persisted.length,
    persisted: persisted.map((item) => ({
      dteDocumentId: item.dteDocumentId,
      duplicate: item.duplicate,
      folio: item.folio,
      rutEmisor: item.rutEmisor
    }))
  });
}

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request) && !(await isSessionAuthorized())) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { maxResults?: number };
    return await runSync(body.maxResults ?? 50);
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

export async function GET(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    return await runSync(50);
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
