"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { productAnalytics } from "@/lib/finance/enterprise-analytics";
import { StatusPill } from "@/components/ui/enterprise";

type ProductRow = ReturnType<typeof productAnalytics>[number];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ProductExplorer({ products }: { products: ProductRow[] }) {
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState("Todos");
  const [selectedName, setSelectedName] = useState(products[0]?.description ?? "");

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return products.filter((product) => {
      const suppliers = product.lastPrices.map((price) => price.supplier).join(" ");
      const haystack = normalize(`${product.description} ${suppliers} ${product.total} ${product.lastPriceClp}`);
      return (!needle || haystack.includes(needle)) && (risk === "Todos" || product.risk === risk);
    });
  }, [products, query, risk]);

  const selected = products.find((product) => product.description === selectedName) ?? filtered[0] ?? products[0];
  const supplierPrices = selected?.lastPrices ?? [];
  const cheapest = supplierPrices.reduce((min, price) => (price.unitPrice < min.unitPrice ? price : min), supplierPrices[0]);
  const expensive = supplierPrices.reduce((max, price) => (price.unitPrice > max.unitPrice ? price : max), supplierPrices[0]);
  const difference =
    cheapest && expensive && cheapest.unitPrice > 0
      ? ((expensive.unitPrice - cheapest.unitPrice) / cheapest.unitPrice) * 100
      : 0;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label>
            <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
              <Search className="h-4 w-4" />
              Buscar producto
            </span>
            <input
              className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Producto, proveedor, precio o categoria"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[#6f6263]">Riesgo</span>
            <select
              className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm"
              onChange={(event) => setRisk(event.target.value)}
              value={risk}
            >
              <option>Todos</option>
              <option value="critical">Alza critica</option>
              <option value="warning">Atencion</option>
              <option value="success">Estable</option>
            </select>
          </label>
        </div>

        <div className="mt-5 max-h-[620px] overflow-auto rounded-xl border border-[#eadfd9]">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-brand-700">
              <tr>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Proveedor ultimo</th>
                <th className="px-4 py-3 text-right">Ultimo</th>
                <th className="px-4 py-3 text-right">Mejor</th>
                <th className="px-4 py-3 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  className="cursor-pointer border-t border-[#f0e5df] hover:bg-brand-50"
                  key={product.description}
                  onClick={() => setSelectedName(product.description)}
                >
                  <td className="px-4 py-3 font-medium text-brand-900">{product.description}</td>
                  <td className="px-4 py-3 text-[#6f6263]">
                    <a className="font-semibold text-brand-700 hover:underline" href={`/proveedores?q=${encodeURIComponent(product.last?.supplier ?? "")}`}>
                      {product.last?.supplier}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-700">{product.lastPriceClp}</td>
                  <td className="px-4 py-3 text-right text-[#6f6263]">{product.bestPriceClp}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={product.risk}>
                      {product.risk === "critical" ? "Alza critica" : product.risk === "warning" ? "Atencion" : "Estable"}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6f6263]">Sin productos para el filtro activo.</div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Detalle producto</p>
          <h2 className="mt-2 text-xl font-semibold text-brand-900">{selected?.description}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-xs text-[#7b6f70]">Proveedor mas barato</p>
              <p className="mt-1 font-semibold text-brand-900">{cheapest?.supplier ?? "Sin datos"}</p>
              <p className="text-sm text-[#6f6263]">{formatClp(cheapest?.unitPrice ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-xs text-[#7b6f70]">Proveedor mas caro</p>
              <p className="mt-1 font-semibold text-brand-900">{expensive?.supplier ?? "Sin datos"}</p>
              <p className="text-sm text-[#6f6263]">{formatClp(expensive?.unitPrice ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-xs text-[#7b6f70]">Diferencia proveedores</p>
              <p className="mt-1 font-semibold text-brand-900">{difference.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-xs text-[#7b6f70]">Tendencia</p>
              <p className="mt-1 font-semibold text-brand-900">
                {selected?.variation ? `${selected.variation.toFixed(1)}%` : "Estable"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-brand-900">Historico de precios</h3>
          <div className="mt-4 space-y-2">
            {supplierPrices.slice(0, 8).map((price) => (
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm" key={`${price.folio}-${price.supplier}-${price.date}`}>
                <div>
                  <p className="font-semibold text-brand-900">{price.supplier}</p>
                  <p className="text-xs text-[#7b6f70]">Folio {price.folio} · {price.date}</p>
                </div>
                <p className="font-semibold text-brand-900">{formatClp(price.unitPrice)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-brand-900">Exports reales</h3>
          <div className="mt-4 grid gap-2">
            {[
              ["Historial precios", "price-history"],
              ["Comparacion mensual", "monthly-comparison"],
              ["Duplicados", "duplicates"],
              ["Alertas precio", "price-alerts"]
            ].map(([label, type]) => (
              <a
                className="inline-flex items-center justify-between rounded-xl border border-[#eadfd9] px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-50"
                href={`/api/exports/products?type=${type}`}
                key={type}
              >
                {label}
                <Download className="h-4 w-4 text-brand-700" />
              </a>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}
