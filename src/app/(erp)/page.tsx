import { AppShell } from "@/components/layout/app-shell";
import {
  currentMonthInvoices,
  formatClp,
  formatMonth,
  purchasesData,
  totalsFor
} from "@/lib/dte/purchases-data";

export default function HomePage() {
  const currentMonth = purchasesData.summaries.byMonth[0]?.key ?? "2026-05";
  const invoices = currentMonthInvoices();
  const totals = totalsFor(invoices);
  const productLines = invoices.reduce(
    (sum, invoice) => sum + invoice.items.length,
    0
  );
  const topSupplier = purchasesData.summaries.suppliers[0];

  return (
    <AppShell>
      <section className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">
            Detalle de compras
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            Resumen actualizado desde {purchasesData.invoiceCount} XML DTE
            cargados del buzon de La Cocina de Javier.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Facturas pagadas", formatClp(0), "Tesoreria"],
            ["Facturas pendientes", formatClp(totals.total), formatMonth(currentMonth)],
            ["Resumen facturacion", formatClp(totals.total), `${totals.documents} documentos`],
            ["Compras realizadas", String(totals.invoices), formatMonth(currentMonth)]
          ].map(([label, value, detail]) => (
            <article
              className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm"
              key={label}
            >
              <p className="text-sm text-[#667068]">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-brand-900">
                {value}
              </p>
              <p className="mt-2 text-sm text-[#667068]">{detail}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Productos comprados", String(productLines), "Lineas con precio neto e IVA"],
            ["Productos unicos", String(purchasesData.summaries.products.length), "Detectados en XML"],
            ["IVA compras", formatClp(totals.iva), "Credito fiscal estimado"],
            [
              "Proveedor principal",
              topSupplier?.totalClp ?? "-",
              topSupplier?.razonSocial ?? "-"
            ]
          ].map(([label, value, detail]) => (
            <article
              className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm"
              key={label}
            >
              <p className="text-sm text-[#667068]">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-brand-900">
                {value}
              </p>
              <p className="mt-2 text-sm text-[#667068]">{detail}</p>
            </article>
          ))}
        </div>

        <section className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-xl font-semibold text-brand-900">
            Compras por mes
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="py-3 pr-4">Mes</th>
                  <th className="py-3 pr-4">Documentos</th>
                  <th className="py-3 pr-4">Facturas</th>
                  <th className="py-3 pr-4">Notas credito</th>
                  <th className="py-3 pr-4">Total con IVA</th>
                </tr>
              </thead>
              <tbody>
                {purchasesData.summaries.byMonth.map((month) => (
                  <tr className="border-b border-[#edf2ee]" key={month.key}>
                    <td className="py-3 pr-4">{formatMonth(month.key)}</td>
                    <td className="py-3 pr-4">{month.documents}</td>
                    <td className="py-3 pr-4">{month.invoices}</td>
                    <td className="py-3 pr-4">{month.creditNotes}</td>
                    <td className="py-3 pr-4 font-semibold text-brand-700">
                      {month.totalClp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
