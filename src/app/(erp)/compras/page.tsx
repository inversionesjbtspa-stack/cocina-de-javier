import {
  BarChart3,
  Boxes,
  CalendarDays,
  Filter,
  PackageSearch,
  Search,
  TrendingUp
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  categorySpend,
  currentMonth,
  currentMonthInvoices,
  priceIncreaseProducts,
  statusTone,
  supplierSpend
} from "@/lib/finance/erp-metrics";
import {
  formatClp,
  formatDate,
  formatMonth,
  purchasesData,
  totalsFor
} from "@/lib/dte/purchases-data";
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

export default function ComprasPage() {
  const invoices = currentMonthInvoices;
  const totals = totalsFor(invoices);
  const categories = categorySpend();
  const suppliers = supplierSpend(8);
  const increases = priceIncreaseProducts(8);
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
                {purchasesData.invoiceCount} XML DTE cargados. Analisis mensual
                de gasto, proveedores, productos y variaciones de precio.
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-3">
                <p className="text-[#667068]">Mes analizado</p>
                <p className="mt-1 font-semibold text-brand-900">
                  {formatMonth(currentMonth)}
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
                Facturas por mes - {formatMonth(currentMonth)}
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

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            <label className="block lg:col-span-2">
              <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
                <Search className="h-4 w-4" />
                Busqueda rapida
              </span>
              <input
                className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm"
                placeholder="Folio, proveedor o producto"
                type="search"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
                <CalendarDays className="h-4 w-4" />
                Mes
              </span>
              <select className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm">
                {purchasesData.summaries.byMonth.map((month) => (
                  <option key={month.key}>{formatMonth(month.key)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
                <Filter className="h-4 w-4" />
                Estado
              </span>
              <select className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm">
                <option>Todos</option>
                <option>Pendiente</option>
                <option>Nota credito</option>
              </select>
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
                <Boxes className="h-4 w-4" />
                Categoria
              </span>
              <select className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm">
                <option>Todas</option>
                {categories.map((category) => (
                  <option key={category.category}>{category.category}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 max-h-[560px] overflow-auto rounded-lg border border-[#e6ebe5]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[#f8faf8]">
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Razon social</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3 text-right">Neto</th>
                  <th className="px-4 py-3 text-right">IVA</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    className="border-b border-[#edf2ee] bg-white hover:bg-[#f8faf8]"
                    key={invoice.normalizedKey ?? `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`}
                  >
                    <td className="px-4 py-3 text-[#4e5a52]">
                      {formatDate(invoice.fechaEmision)}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand-900">
                      {invoice.razonSocialEmisor}
                    </td>
                    <td className="px-4 py-3 text-[#4e5a52]">
                      {invoice.documentType} {invoice.folio}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#4e5a52]">
                      {formatClp(invoice.montoNeto)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#4e5a52]">
                      {formatClp(invoice.iva)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-700">
                      {formatClp(invoice.montoTotal)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge severity={invoice.tipoDte === "61" ? "warning" : "healthy"}>
                        {invoice.tipoDte === "61" ? "Nota credito" : invoice.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {invoice.tipoDte === "61" ? (
                        <span className="text-xs text-[#667068]">Ajuste</span>
                      ) : (
                        <div className="flex gap-2">
                          <a
                            className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-900"
                            href={`/api/invoices/${invoice.folio}/pdf`}
                            target="_blank"
                          >
                            Ver
                          </a>
                          <a
                            className="rounded-md border border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-[#edf2ee]"
                            href={`/api/invoices/${invoice.folio}/pdf?download=1`}
                          >
                            Descargar
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  {purchasesData.summaries.products.slice(0, 12).map((product) => (
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
              {purchasesData.summaries.byMonth.map((month) => {
                const max = purchasesData.summaries.byMonth[0]?.total ?? 1;
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

