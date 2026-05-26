import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminConfig } from "@/lib/env";

export type IntelligentPriceAlert = {
  productId: string;
  product: string;
  supplier: string;
  latestPrice: number;
  averageLastThree: number;
  monthlyAverage: number;
  bestHistorical: number;
  variation: number;
  impact: number;
  latestDate: string;
  state: "estable" | "atencion" | "critico" | "dato sospechoso";
  recommendation: string;
  unit?: string;
};

export async function getIntelligentPriceAlerts(threshold = Number(process.env.PRICE_ALERT_THRESHOLD ?? 20)) {
  noStore();
  if (!hasSupabaseAdminConfig()) return [] as IntelligentPriceAlert[];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("dte_items")
    .select("id,product_id,name,unit,unit_price,quantity,line_total,price_confidence_score,item_validation_status,dte_documents!inner(fecha_emision,supplier_id,suppliers(legal_name))")
    .not("product_id", "is", null)
    .gte("price_confidence_score", 90)
    .gt("unit_price", 0)
    .order("created_at", { ascending: false })
    .limit(2500);

  const rows = new Map<string, Array<Record<string, unknown>>>();
  (data ?? []).forEach((row) => {
    const key = `${row.product_id}:${String(row.unit ?? "unidad").toUpperCase()}`;
    rows.set(key, [...(rows.get(key) ?? []), row]);
  });

  return [...rows.values()].flatMap((history) => {
    const sorted = history.sort((a, b) => String((b.dte_documents as { fecha_emision?: string })?.fecha_emision).localeCompare(String((a.dte_documents as { fecha_emision?: string })?.fecha_emision)));
    const latest = sorted[0];
    const lastThreePrevious = sorted.slice(1, 4);
    if (!latest || !lastThreePrevious.length) return [];
    const latestDoc = latest.dte_documents as { fecha_emision?: string; suppliers?: { legal_name?: string } | null } | null;
    const latestPrice = Number(latest.unit_price ?? 0);
    const averageLastThree = lastThreePrevious.reduce((sum, row) => sum + Number(row.unit_price ?? 0), 0) / lastThreePrevious.length;
    const monthlyRows = sorted.filter((row) => String((row.dte_documents as { fecha_emision?: string } | null)?.fecha_emision).slice(0, 7) === String(latestDoc?.fecha_emision).slice(0, 7));
    const monthlyAverage = monthlyRows.reduce((sum, row) => sum + Number(row.unit_price ?? 0), 0) / Math.max(1, monthlyRows.length);
    const bestHistorical = sorted.reduce((best, row) => Math.min(best, Number(row.unit_price ?? best)), latestPrice);
    const variation = averageLastThree > 0 ? ((latestPrice - averageLastThree) / averageLastThree) * 100 : 0;
    const unit = String(latest.unit ?? "unidad");
    const confidence = Number(latest.price_confidence_score ?? 0);
    const status = String(latest.item_validation_status ?? "");
    const state: IntelligentPriceAlert["state"] =
      confidence < 90 || status === "warning" || !Number.isFinite(variation) || averageLastThree <= 0
        ? "dato sospechoso"
        : variation >= threshold
          ? "critico"
          : variation >= threshold / 2
            ? "atencion"
            : "estable";
    if (state === "estable") return [];
    return [{
      averageLastThree,
      bestHistorical,
      impact: Math.max(0, latestPrice - Math.min(averageLastThree, monthlyAverage, bestHistorical)),
      latestDate: String(latestDoc?.fecha_emision ?? ""),
      latestPrice,
      monthlyAverage,
      product: String(latest.name ?? "Producto sin nombre"),
      productId: String(latest.product_id),
      recommendation: state === "dato sospechoso" ? "Revisar unidad, cantidad o pack antes de usar este precio para alertas." : state === "critico" ? "Revisar proveedor alternativo o negociar antes de la proxima compra." : "Comparar la proxima factura con promedio y mejor precio historico.",
      state,
      supplier: latestDoc?.suppliers?.legal_name ?? "Proveedor no informado",
      unit,
      variation
    }];
  }).sort((a, b) => b.variation - a.variation).slice(0, 12);
}
