import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const [
    docs,
    parsed,
    items,
    itemsWithoutPrice,
    products,
    suppliersMissing,
    errors,
    lastSync
  ] = await Promise.all([
    supabase.from("dte_documents").select("id", { count: "exact", head: true }),
    supabase.from("dte_documents").select("id", { count: "exact", head: true }).not("raw_json", "eq", "{}"),
    supabase.from("dte_items").select("id", { count: "exact", head: true }),
    supabase.from("dte_items").select("id", { count: "exact", head: true }).lte("unit_price", 0),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("dte_documents").select("id", { count: "exact", head: true }).is("supplier_id", null),
    supabase
      .from("dte_processing_errors")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
    supabase.from("dte_sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  const withoutItemsFallback = await supabase
    .from("dte_documents")
    .select("id,dte_items(id)")
    .limit(1000);
  const documentsWithoutItems = withoutItemsFallback.data?.filter((row) => !row.dte_items?.length).length ?? null;
  const itemNameAudit = await supabase
    .from("dte_items")
    .select("id,name,dte_documents!inner(xml_original)")
    .not("dte_documents.xml_original", "is", null)
    .limit(1000);
  const itemsWithoutNameWithXml =
    itemNameAudit.data?.filter((row) => !String(row.name ?? "").trim()).length ?? null;

  const ok =
    !docs.error &&
    !parsed.error &&
    !items.error &&
    !itemsWithoutPrice.error &&
    !suppliersMissing.error &&
    itemsWithoutNameWithXml === 0;

  return NextResponse.json(
    {
      ok,
      xmlStored: docs.count,
      xmlParsed: parsed.count,
      itemsParsed: items.count,
      documentsWithoutItems,
      itemsWithoutNameWithXml,
      itemsWithoutPrice: itemsWithoutPrice.count,
      products: products.count,
      invoicesWithoutSupplier: suppliersMissing.count,
      parserErrorsLast7Days: errors.count,
      lastSync: lastSync.data,
      checkedAt: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
