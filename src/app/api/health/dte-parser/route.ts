import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const [
    docs,
    parsed,
    items,
    itemsWithoutPrice,
    itemsWithoutProducts,
    suspiciousProducts,
    taxedItems,
    itemTaxes,
    products,
    suppliersMissing,
    errors,
    lastSync
  ] = await Promise.all([
    supabase.from("dte_documents").select("id", { count: "exact", head: true }),
    supabase.from("dte_documents").select("id", { count: "exact", head: true }).not("raw_json", "eq", "{}"),
    supabase.from("dte_items").select("id", { count: "exact", head: true }),
    supabase.from("dte_items").select("id", { count: "exact", head: true }).lte("unit_price", 0),
    supabase.from("dte_items").select("id", { count: "exact", head: true }).is("product_id", null),
    supabase
      .from("dte_items")
      .select("id", { count: "exact", head: true })
      .or("name.ilike.1 caja,name.ilike.1 unidad"),
    supabase.from("dte_items").select("id", { count: "exact", head: true }).not("additional_tax_code", "is", null),
    supabase.from("dte_taxes").select("id", { count: "exact", head: true }).not("dte_item_id", "is", null),
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
    !itemsWithoutProducts.error &&
    !suppliersMissing.error &&
    itemsWithoutNameWithXml === 0 &&
    documentsWithoutItems === 0 &&
    (itemsWithoutProducts.count ?? 0) === 0 &&
    (suspiciousProducts.count ?? 0) === 0 &&
    (taxedItems.count ?? 0) <= (itemTaxes.count ?? 0) &&
    Boolean(serverEnv.CRON_SECRET) &&
    lastSync.data?.status === "completed";

  return NextResponse.json(
    {
      ok,
      xmlStored: docs.count,
      xmlParsed: parsed.count,
      itemsParsed: items.count,
      documentsWithoutItems,
      itemsWithoutNameWithXml,
      itemsWithoutPrice: itemsWithoutPrice.count,
      itemsWithoutProducts: itemsWithoutProducts.count,
      suspiciousItemNames: suspiciousProducts.count,
      additionalTaxedItems: taxedItems.count,
      additionalItemTaxRows: itemTaxes.count,
      products: products.count,
      invoicesWithoutSupplier: suppliersMissing.count,
      parserErrorsLast7Days: errors.count,
      lastSync: lastSync.data,
      cronSecretConfigured: Boolean(serverEnv.CRON_SECRET),
      pdfGenerableDocuments: Math.max(0, (docs.count ?? 0) - (documentsWithoutItems ?? 0)),
      checkedAt: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
