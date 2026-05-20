import {
  BarChart3,
  PackageSearch,
  TrendingUp
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PurchaseSearchTable } from "@/components/purchases/purchase-search-table";
import {
  createErpMetrics,
  statusTone,
} from "@/lib/finance/erp-metrics";
import {
  formatClp,
  formatMonth,
  totalsFor
} from "@/lib/dte/purchases-data";
import { getDtePurchaseData } from "@/lib/dte/supabase-data";
import type { ReactNode } from "react";

function Badge({
  children,
  severity = "healthy"
}: {
  children: ReactNode;
  severity?: "healthy" | "warning" | "critical";
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(severity).badge}`}>
      {children}
    </span>
  );
}

export default async function ComprasPage() {
  const dteData = await getDtePurchaseData();
  const metrics = createErpMetrics(dteData);
  const invoices = metrics.currentMonthInvoices;
  const totals = totalsFor(invoices);
  const categories = metrics.categorySpend();
  const suppliers = metrics.supplierSpend(8);
  const increases = metrics.priceIncreaseProducts(8);
  const topCategory = categories[0];
  const topSupplier = suppliers[0];

  return (
    <AppShell>
      <section className="space-y-8">
        <div className="rounded-lg border border-[#dfe4dd] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                Analytics operativo
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-900">
                Compras
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
                {dteData.invoiceCount} XML DTE cargados. Analisis mensual
                de gasto, proveedores, productos y variaciones de precio.
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-3">
                <p className="text-[#667068]">Mes analizado</p>
                <p className="mt-1 font-semibold text-brand-900">
                  {formatMonth(metrics.currentMonth)}
                </p>
              </div>
              <div className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-3">
                <p className="text-[#667068]">Total con IVA</p>
                <p className="mt-1 font-semibold text-brand-900">
                  {formatClp(totals.total)}
                </p>
              </div>
              <div className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-3">
                <p className="text-[#667068]">Facturas</p>
                <p className="mt-1 font-semibold text-brand-900">
                  {totals.invoices}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-brand-700" />
              <h2 className="font-semibold text-brand-900">Gasto por categoria</h2>
            </div>
            <div className="mt-5 space-y-4">
              {categories.slice(0, 6).map((row) => {
                const width = topCategory
                  ? Math.max(6, (row.total / topCategory.total) * 100)
                  : 0;
                return (
                  <div key={row.category}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-brand-900">
                        {row.category}
                      </span>
                      <span className="font-semibold text-brand-700">
                        {row.totalClp}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[#edf2ee]">
                      <div
                        className="h-2 rounded-full bg-brand-700"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-brand-700" />
              <h2 className="font-semibold text-brand-900">Ranking proveedores</h2>
            </div>
            <div className="mt-5 space-y-4">
              {suppliers.slice(0, 6).map((supplier, index) => {
                const width = topSupplier
                  ? Math.max(6, (supplier.total / topSupplier.total) * 100)
                  : 0;
                return (
                  <div key={supplier.supplier}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-brand-900">
                        {index + 1}. {supplier.supplier}
                      </span>
                      <span className="font-semibold text-brand-700">
                        {supplier.totalClp}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[#edf2ee]">
                      <div
                        className="h-2 rounded-full bg-[#476a8f]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand-700" />
              <h2 className="font-semibold text-brand-900">Mayor alza de precios</h2>
            </div>
            <div className="mt-5 space-y-3">
              {increases.slice(0, 6).map((product) => (
                <div
                  className={`rounded-lg border p-3 ${statusTone(product.severity).panel}`}
                  key={product.description}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-brand-900">
                      {product.description}
                    </p>
                    <Badge severity={product.severity}>
                      {`+${product.variation.toFixed(1)}%`}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-[#667068]">
                    Ultimo precio {formatClp(product.latest?.unitPrice ?? 0)} ·{" "}
                    {product.latest?.supplier}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-900">
                Facturas por mes - {formatMonth(metrics.currentMonth)}
              </h2>
              <p className="mt-1 text-sm text-[#667068]">
                Tabla enterprise con filtros visuales, montos CLP y acciones PDF.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{`${invoices.length} documentos`}</Badge>
              <Badge>{`${formatClp(totals.total)} total`}</Badge>
              <Badge severity={totals.creditNotes ? "warning" : "healthy"}>
                {`${totals.creditNotes} notas credito`}
              </Badge>
            </div>
          </div>

          <PurchaseSearchTable invoices={dteData.invoices} />
        </article>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-brand-900">Productos mas comprados</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                    <th className="py-3 pr-4">Producto</th>
                    <th className="py-3 pr-4 text-right">Cantidad</th>
                    <th className="py-3 pr-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dteData.summaries.products.slice(0, 12).map((product) => (
                    <tr className="border-b border-[#edf2ee]" key={product.description}>
                      <td className="py-3 pr-4 text-[#4e5a52]">
                        {product.description}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {product.quantity.toLocaleString("es-CL")}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-brand-700">
                        {product.totalClp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-brand-900">
              Comparacion mensual
            </h2>
            <div className="mt-4 space-y-4">
              {dteData.summaries.byMonth.map((month) => {
                const max = dteData.summaries.byMonth[0]?.total ?? 1;
                const width = Math.max(5, (month.total / max) * 100);

                return (
                  <div key={month.key}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-brand-900">
                        {formatMonth(month.key)}
                      </span>
                      <span className="font-semibold text-brand-700">
                        {month.totalClp}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[#edf2ee]">
                      <div
                        className="h-2 rounded-full bg-[#6f5f46]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </section>
    </AppShell>
  );
}

