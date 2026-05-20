import { NextResponse } from "next/server";
import { parseDteXml } from "@/lib/dte/parser";
import { persistExtractedDteInvoices } from "@/lib/dte/persist";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function isAuthorized(request: Request) {
  if (
    serverEnv.CRON_SECRET &&
    request.headers.get("authorization") === `Bearer ${serverEnv.CRON_SECRET}`
  ) {
    return true;
  }
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return Boolean(user);
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    folio?: string;
    rutEmisor?: string;
    dryRun?: boolean;
    limit?: number;
  };
  const supabase = createAdminClient();
  let query = supabase
    .from("dte_documents")
    .select("id,folio,rut_emisor,tipo_dte,gmail_message_id,gmail_thread_id,gmail_attachment_id,gmail_filename,gmail_received_at,gmail_sender,gmail_subject,xml_original")
    .not("xml_original", "is", null)
    .order("fecha_emision", { ascending: false })
    .limit(Math.min(body.limit ?? 50, 200));

  if (body.folio) {
    query = query.eq("folio", body.folio);
  }
  if (body.rutEmisor) {
    query = query.eq("rut_emisor", body.rutEmisor);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const parsed = [];
  const rejected = [];
  for (const document of data ?? []) {
    try {
      parsed.push({
        invoice: parseDteXml({
          sourceAttachmentId: document.gmail_attachment_id ?? `${document.id}:xml_original`,
          sourceFilename: document.gmail_filename ?? `${document.tipo_dte}-${document.folio}.xml`,
          sourceMessageId: document.gmail_message_id ?? document.id,
          sourceReceivedAt: document.gmail_received_at,
          sourceSender: document.gmail_sender,
          sourceSubject: document.gmail_subject,
          sourceThreadId: document.gmail_thread_id,
          xml: document.xml_original
        }),
        xml: document.xml_original
      });
    } catch (cause) {
      rejected.push({
        folio: document.folio,
        reason: cause instanceof Error ? cause.message : "Unknown reparse error",
        rutEmisor: document.rut_emisor
      });
    }
  }

  if (body.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      candidates: data?.length ?? 0,
      parsed: parsed.length,
      rejected
    });
  }

  const persisted = parsed.length ? await persistExtractedDteInvoices(parsed) : [];
  await supabase.from("audit_events").insert({
    event_type: "dte.reparse_completed",
    entity_type: "dte_pipeline",
    after_data: {
      candidates: data?.length ?? 0,
      folio: body.folio ?? null,
      persisted: persisted.length,
      rejected: rejected.length,
      rut_emisor: body.rutEmisor ?? null
    }
  });

  return NextResponse.json({
    ok: true,
    dryRun: false,
    candidates: data?.length ?? 0,
    parsed: parsed.length,
    persisted: persisted.length,
    rejected
  });
}
