import { AppShell } from "@/components/layout/app-shell";
import {
  formatClp,
  formatDate,
  formatMonth,
  purchasesData,
  totalsFor
} from "@/lib/dte/purchases-data";

export default function ComprasPage() {
  const currentMonth = purchasesData.summaries.byMonth[0]?.key ?? "2026-05";
  const invoices = purchasesData.invoices.filter((invoice) =>
    invoice.fechaEmision.startsWith(currentMonth)
  );
  const totals = totalsFor(invoices);

  return (
    <AppShell>
      <section className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">Compras</h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            {purchasesData.invoiceCount} XML DTE cargados. Vista mensual con
            fecha, razon social, monto y detalle de productos comprados.
          </p>
        </div>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Facturas por mes - {formatMonth(currentMonth)}
          </h2>
          <p className="mt-2 text-sm text-[#5d665f]">
            {invoices.length} documentos encontrados | Total con IVA{" "}
            {formatClp(totals.total)} | IVA {formatClp(totals.iva)} | Notas de
            credito {totals.creditNotes}
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm text-[#5d665f]">Buscar documento</span>
              <input
                className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm"
                placeholder="Folio, proveedor o producto"
                type="search"
              />
            </label>
            <label className="block">
              <span className="text-sm text-[#5d665f]">Mes</span>
              <select className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm">
                {purchasesData.summaries.byMonth.map((month) => (
                  <option key={month.key}>{formatMonth(month.key)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-[#5d665f]">Dia</span>
              <input
                className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm"
                defaultValue={invoices[0]?.fechaEmision}
                type="date"
              />
            </label>
            <label className="block">
              <span className="text-sm text-[#5d665f]">Ano</span>
              <select className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm">
                {purchasesData.summaries.byYear.map((year) => (
                  <option key={year.key}>{year.key}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="py-3 pr-4">Fecha</th>
                  <th className="py-3 pr-4">Razon social</th>
                  <th className="py-3 pr-4">Documento</th>
                  <th className="py-3 pr-4">Monto</th>
                  <th className="py-3 pr-4">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-b border-[#edf2ee]" key={invoice.normalizedKey ?? `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`}>
                    <td className="py-3 pr-4 text-[#4e5a52]">
                      {formatDate(invoice.fechaEmision)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-brand-900">
                      {invoice.razonSocialEmisor}
                    </td>
                    <td className="py-3 pr-4 text-[#4e5a52]">
                      {invoice.documentType} {invoice.folio}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-brand-700">
                      {formatClp(invoice.montoTotal)}
                    </td>
                    <td className="py-3 pr-4">
                      {invoice.tipoDte === "61" ? (
                        <span className="text-sm text-[#667068]">
                          Nota de credito
                        </span>
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

        <section className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Productos mas comprados
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="py-3 pr-4">Producto</th>
                  <th className="py-3 pr-4">Cantidad</th>
                  <th className="py-3 pr-4">Ultimos precios</th>
                  <th className="py-3 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchasesData.summaries.products.slice(0, 15).map((product) => (
                  <tr className="border-b border-[#edf2ee]" key={product.description}>
                    <td className="py-3 pr-4">{product.description}</td>
                    <td className="py-3 pr-4">
                      {product.quantity.toLocaleString("es-CL")}
                    </td>
                    <td className="py-3 pr-4 text-[#4e5a52]">
                      {product.lastPrices.map((price) => (
                        <div key={`${price.folio}-${price.date}`}>
                          {formatDate(price.date)} {formatClp(price.unitPrice)}
                        </div>
                      ))}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-brand-700">
                      {product.totalClp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-3">
          {invoices.slice(0, 25).map((invoice, index) => (
            <details
              className="rounded-lg border border-[#dfe4dd] bg-white p-5"
              key={`${invoice.rutEmisor}-${invoice.folio}`}
              open={index === 0}
            >
              <summary className="cursor-pointer font-semibold text-brand-900">
                Detalle {invoice.documentType} {invoice.folio} -{" "}
                {invoice.razonSocialEmisor}
              </summary>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                      <th className="py-3 pr-4">Producto</th>
                      <th className="py-3 pr-4">Cantidad</th>
                      <th className="py-3 pr-4">Precio unitario</th>
                      <th className="py-3 pr-4">Total linea</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr className="border-b border-[#edf2ee]" key={item.lineNumber}>
                        <td className="py-3 pr-4 text-[#4e5a52]">
                          {item.description}
                        </td>
                        <td className="py-3 pr-4 text-[#4e5a52]">
                          {item.quantity.toLocaleString("es-CL")}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-brand-700">
                          {formatClp(item.unitPrice)}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-brand-700">
                          {formatClp(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
