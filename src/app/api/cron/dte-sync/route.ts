import { NextResponse } from "next/server";
import { fetchDteXmlAttachmentsViaImap } from "@/lib/dte/imap-client";
import { parseDteXml } from "@/lib/dte/parser";

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
  const invoices = attachments.map((attachment) =>
    parseDteXml({
      xml: attachment.xml,
      sourceMessageId: attachment.messageId,
      sourceAttachmentId: attachment.attachmentId,
      sourceFilename: attachment.filename
    })
  );

  return NextResponse.json({
    ok: true,
    source: "dte@lacocinadejavier.cl",
    syncedAt: new Date().toISOString(),
    count: invoices.length,
    invoices
  });
}
