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
import { getUnifiedPurchasesByMonth } from "@/lib/dte/supabase-data";
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
  const dteData = await getUnifiedPurchasesByMonth();
  const metrics = createErpMetrics(dteData);
  const invoices = metrics.currentMonthInvoices;
  const totals = totalsFor(invoices);
  const xmlInvoices = invoices.filter((invoice) => invoice.xmlStatus !== "missing" && invoice.source !== "sii");
  const pendingXmlInvoices = invoices.filter((invoice) => invoice.xmlStatus === "missing" || invoice.source === "sii");
  const xmlTotals = totalsFor(xmlInvoices);
  const pendingXmlTotals = totalsFor(pendingXmlInvoices);
  const pendingXmlSuppliers = new Set(pendingXmlInvoices.map((invoice) => invoice.rutEmisor)).size;
  const paidInvoices = invoices.filter((invoice) => ["paid", "pagada", "Pagada"].includes(invoice.paymentStatus));
  const inBatchInvoices = invoices.filter((invoice) => ["scheduled", "in_batch", "en_nomina", "En nomina"].includes(invoice.paymentStatus));
  const unpaidInvoices = invoices.filter((invoice) => !paidInvoices.includes(invoice));
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
                {dteData.invoiceCount} documentos consolidados entre XML recibidos
                y facturas detectadas en SII pendientes de XML. Productos y alertas
                de precio se calculan solo con XML que tiene detalle.
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">Documentos totales</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">{invoices.length}</p>
            <p className="mt-1 text-xs text-[#667068]">XML + SII sin duplicar</p>
          </article>
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">Documentos con XML</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-800">{xmlInvoices.length}</p>
            <p className="mt-1 text-xs text-[#667068]">{formatClp(xmlTotals.total)} con respaldo XML</p>
          </article>
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">Pendientes XML</p>
            <p className="mt-2 text-2xl font-semibold text-amber-800">{pendingXmlInvoices.length}</p>
            <p className="mt-1 text-xs text-[#667068]">{formatClp(pendingXmlTotals.total)} detectado en SII</p>
          </article>
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">Proveedores con XML pendiente</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">{pendingXmlSuppliers}</p>
            <p className="mt-1 text-xs text-[#667068]">Cruce Control SII vs XML</p>
          </article>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">Pagadas</p>
            <p className="mt-2 text-xl font-semibold text-emerald-800">{paidInvoices.length}</p>
            <p className="mt-1 text-xs text-[#667068]">{formatClp(totalsFor(paidInvoices).total)}</p>
          </article>
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">No pagadas</p>
            <p className="mt-2 text-xl font-semibold text-amber-800">{unpaidInvoices.length}</p>
            <p className="mt-1 text-xs text-[#667068]">{formatClp(totalsFor(unpaidInvoices).total)}</p>
          </article>
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-[#667068]">En nomina</p>
            <p className="mt-2 text-xl font-semibold text-brand-900">{inBatchInvoices.length}</p>
            <p className="mt-1 text-xs text-[#667068]">{formatClp(totalsFor(inBatchInvoices).total)}</p>
          </article>
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
                Tabla unificada con XML recibido y facturas SII pendientes de XML.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{`${invoices.length} documentos`}</Badge>
              <Badge>{`${xmlInvoices.length} con XML`}</Badge>
              <Badge severity={pendingXmlInvoices.length ? "warning" : "healthy"}>{`${pendingXmlInvoices.length} pendientes XML`}</Badge>
              <Badge>{`${formatClp(totals.total)} total`}</Badge>
              <Badge severity={totals.creditNotes ? "warning" : "healthy"}>
                {`${totals.creditNotes} notas credito`}
              </Badge>
            </div>
          </div>

          <PurchaseSearchTable invoices={dteData.invoices} />
        </article>

        {dteData.diagnostics ? (
          <details className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <summary className="cursor-pointer font-semibold">Diagnostico integracion Compras / SII</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <p>DTE encontrados: <b>{dteData.diagnostics.dteRows}</b>{dteData.diagnostics.dteRowsFallback ? " (fallback)" : ""}</p>
              <p>SII encontrados: <b>{dteData.diagnostics.siiRows}</b>{dteData.diagnostics.siiRowsFallback ? " (fallback)" : ""}</p>
              <p>Manuales encontrados: <b>{dteData.diagnostics.manualRows}</b>{dteData.diagnostics.manualRowsFallback ? " (fallback)" : ""}</p>
              <p>SII descartados por deduplicacion: <b>{dteData.diagnostics.siiRowsDiscardedByDedup}</b></p>
              <p>Descartados por periodo: <b>{dteData.diagnostics.siiRowsDiscardedByPeriod}</b></p>
              <p>Manuales descartados: <b>{dteData.diagnostics.manualRowsDiscarded}</b></p>
              <p>Resultado unificado final: <b>{dteData.diagnostics.finalUnifiedRows}</b></p>
            </div>
            {dteData.diagnostics.errors.length ? (
              <pre className="mt-4 whitespace-pre-wrap rounded-md bg-white p-3 text-xs">{dteData.diagnostics.errors.join("\n")}</pre>
            ) : null}
          </details>
        ) : null}

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

