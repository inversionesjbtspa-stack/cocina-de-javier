import Link from "next/link";
import { formatClp } from "@/lib/dte/purchases-data";
import type { IntelligentPriceAlert } from "@/lib/finance/price-alerts";

export function PriceAlertPanel({ alerts }: { alerts: IntelligentPriceAlert[] }) {
  return (
    <section className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-semibold text-brand-900">Alertas inteligentes de precios</h2><p className="mt-1 text-sm text-[#667068]">Solo compara historial de precios DTE con datos validados para variaciones operativas.</p></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="text-left text-xs uppercase text-brand-700"><tr><th className="py-2">Producto</th><th>Proveedor</th><th className="text-right">Ultimo</th><th className="text-right">Prom. 3</th><th className="text-right">Variacion</th><th className="text-right">Impacto</th><th>Estado / accion</th></tr></thead><tbody>
        {alerts.map((alert) => <tr className="border-t border-[#edf2ee]" key={`${alert.productId}-${alert.latestDate}`}><td className="py-3 pr-3"><Link className="font-semibold text-brand-900 hover:underline" href={`/productos?producto=${encodeURIComponent(alert.product)}`}>{alert.product}</Link><p className="text-xs text-[#667068]">{alert.latestDate} / mejor {formatClp(alert.bestHistorical)}</p></td><td><Link className="hover:underline" href={`/proveedores?q=${encodeURIComponent(alert.supplier)}`}>{alert.supplier}</Link></td><td className="text-right">{formatClp(alert.latestPrice)}</td><td className="text-right">{formatClp(alert.averageLastThree)}</td><td className="text-right font-semibold">{alert.variation.toFixed(1)}%</td><td className="text-right">{formatClp(alert.impact)}</td><td><span className={alert.state === "critico" ? "rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700" : "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"}>{alert.state}</span><p className="mt-1 max-w-xs text-xs text-[#667068]">{alert.recommendation}</p></td></tr>)}
      </tbody></table>{!alerts.length ? <div className="p-6 text-sm text-[#667068]">No hay alzas validadas sobre el umbral actual.</div> : null}</div>
    </section>
  );
}
