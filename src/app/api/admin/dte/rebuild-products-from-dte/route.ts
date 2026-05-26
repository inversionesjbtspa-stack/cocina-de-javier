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

async function consistencySnapshot(supabase: ReturnType<typeof createAdminClient>) {
  const [docsWithoutSupplier, docsWithItems, itemsWithoutProduct, productsWithoutHistory, invoicesWithPayable] = await Promise.all([
    supabase.from("dte_documents").select("id", { count: "exact", head: true }).is("supplier_id", null),
    supabase.from("dte_documents").select("id,dte_items(id)").limit(5000),
    supabase.from("dte_items").select("id", { count: "exact", head: true }).is("product_id", null),
    supabase.from("products").select("id,product_price_history(id)").limit(5000),
    supabase.from("dte_documents").select("id,tipo_dte,accounts_payable(id)").neq("tipo_dte", "61").limit(5000)
  ]);
  return {
    documentsWithoutItems: docsWithItems.data?.filter((row) => !row.dte_items?.length).length ?? null,
    documentsWithoutSupplier: docsWithoutSupplier.count ?? null,
    invoicesWithoutPayable: invoicesWithPayable.data?.filter((row) => !row.accounts_payable?.length).length ?? null,
    itemsWithoutProduct: itemsWithoutProduct.count ?? null,
    productsWithoutHistory: productsWithoutHistory.data?.filter((row) => !row.product_price_history?.length).length ?? null
  };
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    folio?: string;
    rutEmisor?: string;
    limit?: number;
  };
  const supabase = createAdminClient();
  const before = await consistencySnapshot(supabase);
  let query = supabase
    .from("dte_documents")
    .select(
      "id,folio,rut_emisor,tipo_dte,gmail_message_id,gmail_thread_id,gmail_attachment_id,gmail_filename,gmail_received_at,gmail_sender,gmail_subject,xml_original"
    )
    .not("xml_original", "is", null)
    .order("fecha_emision", { ascending: false })
    .limit(Math.min(body.limit ?? 2000, 5000));

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
        reason: cause instanceof Error ? cause.message : "Unknown rebuild parse error",
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
  const after = await consistencySnapshot(supabase);
  await supabase.from("audit_events").insert({
    after_data: {
      after,
      before,
      candidates: data?.length ?? 0,
      persisted: persisted.length,
      rejected: rejected.length
    },
    entity_type: "dte_pipeline",
    event_type: "dte.consistency_rebuilt"
  });

  return NextResponse.json({
    after,
    before,
    ok: true,
    dryRun: false,
    candidates: data?.length ?? 0,
    parsed: parsed.length,
    rebuilt: persisted.length,
    rejected
  });
}
