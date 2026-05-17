import { NextResponse } from "next/server";
import { fetchDteXmlAttachmentsViaImap } from "@/lib/dte/imap-client";
import { parseDteXml } from "@/lib/dte/parser";
import { persistExtractedDteInvoices } from "@/lib/dte/persist";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized"
      },
      { status: 401 }
    );
  }

  const attachments = await fetchDteXmlAttachmentsViaImap();
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
    syncedAt: new Date().toISOString(),
    found: attachments.length,
    count: parsed.length,
    rejected,
    persisted,
    invoices: parsed.map((item) => item.invoice)
  });
}
