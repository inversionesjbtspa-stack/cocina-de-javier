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
};

export async function getIntelligentPriceAlerts(threshold = Number(process.env.PRICE_ALERT_THRESHOLD ?? 20)) {
  noStore();
  if (!hasSupabaseAdminConfig()) return [] as IntelligentPriceAlert[];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("product_price_history")
    .select("product_id,price,effective_date,products(name),suppliers(legal_name)")
    .eq("source_entity_type", "dte_document")
    .gt("price", 0)
    .order("effective_date", { ascending: false })
    .limit(1800);

  const rows = new Map<string, Array<Record<string, unknown>>>();
  (data ?? []).forEach((row) => rows.set(row.product_id, [...(rows.get(row.product_id) ?? []), row]));

  return [...rows.entries()].flatMap(([productId, history]) => {
    const latest = history[0];
    const lastThreePrevious = history.slice(1, 4);
    if (!latest || !lastThreePrevious.length) return [];
    const latestPrice = Number(latest.price ?? 0);
    const averageLastThree = lastThreePrevious.reduce((sum, row) => sum + Number(row.price ?? 0), 0) / lastThreePrevious.length;
    const monthlyRows = history.filter((row) => String(row.effective_date).slice(0, 7) === String(latest.effective_date).slice(0, 7));
    const monthlyAverage = monthlyRows.reduce((sum, row) => sum + Number(row.price ?? 0), 0) / Math.max(1, monthlyRows.length);
    const bestHistorical = history.reduce((best, row) => Math.min(best, Number(row.price ?? best)), latestPrice);
    const variation = averageLastThree > 0 ? ((latestPrice - averageLastThree) / averageLastThree) * 100 : 0;
    const suppliers = latest.suppliers as { legal_name?: string } | null;
    const products = latest.products as { name?: string } | null;
    const state: IntelligentPriceAlert["state"] =
      !Number.isFinite(variation) || averageLastThree <= 0
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
      latestDate: String(latest.effective_date),
      latestPrice,
      monthlyAverage,
      product: products?.name ?? "Producto sin nombre",
      productId,
      recommendation: state === "critico" ? "Revisar proveedor alternativo o negociar antes de la proxima compra." : "Comparar la proxima factura con promedio y mejor precio historico.",
      state,
      supplier: suppliers?.legal_name ?? "Proveedor no informado",
      variation
    }];
  }).sort((a, b) => b.variation - a.variation).slice(0, 12);
}
