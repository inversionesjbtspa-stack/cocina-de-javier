import { AppShell } from "@/components/layout/app-shell";
import {
  currentMonthInvoices,
  formatClp,
  formatDate,
  formatMonth,
  purchasesData
} from "@/lib/dte/purchases-data";

export default function TesoreriaPage() {
  const currentMonth = purchasesData.summaries.byMonth[0]?.key ?? "2026-05";
  const invoices = currentMonthInvoices().filter((invoice) => invoice.tipoDte !== "61");
  const pending = invoices.reduce((sum, invoice) => sum + invoice.montoTotal, 0);

  return (
    <AppShell>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">Tesoreria</h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            Facturas del mes, estados de pago y generacion de pagos masivos
            desde XML DTE.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Pendientes del mes", formatClp(pending)],
            ["Pagadas del mes", formatClp(0)],
            ["Facturas mes", String(invoices.length)],
            ["Mes actual", formatMonth(currentMonth)]
          ].map(([label, value]) => (
            <article
              className="rounded-lg border border-[#dfe4dd] bg-white p-5"
              key={label}
            >
              <p className="text-sm text-[#667068]">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-brand-900">
                {value}
              </p>
            </article>
          ))}
        </div>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Facturas del mes - {formatMonth(currentMonth)}
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="py-3 pr-4">Fecha</th>
                  <th className="py-3 pr-4">Proveedor</th>
                  <th className="py-3 pr-4">Documento</th>
                  <th className="py-3 pr-4">Vencimiento</th>
                  <th className="py-3 pr-4">Monto</th>
                  <th className="py-3 pr-4">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-b border-[#edf2ee]" key={`${invoice.rutEmisor}-${invoice.folio}`}>
                    <td className="py-3 pr-4">{formatDate(invoice.fechaEmision)}</td>
                    <td className="py-3 pr-4">{invoice.razonSocialEmisor}</td>
                    <td className="py-3 pr-4">{invoice.folio}</td>
                    <td className="py-3 pr-4">{formatDate(invoice.fechaVencimiento)}</td>
                    <td className="py-3 pr-4 font-semibold text-brand-700">
                      {formatClp(invoice.montoTotal)}
                    </td>
                    <td className="py-3 pr-4">{invoice.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Generar pagos
          </h2>
          <p className="mt-2 text-sm text-[#5d665f]">
            Exporta facturas pendientes al formato base de pagos masivos
            Santander.
          </p>
          <a
            className="mt-4 inline-block rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white"
            href="/api/payment-template"
          >
            Generar pagos
          </a>
        </article>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Datos proveedor
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="py-3 pr-4">Razon social</th>
                  <th className="py-3 pr-4">RUT</th>
                  <th className="py-3 pr-4">Mail</th>
                  <th className="py-3 pr-4">Contacto</th>
                  <th className="py-3 pr-4">Codigo banco</th>
                </tr>
              </thead>
              <tbody>
                {purchasesData.summaries.suppliers.map((supplier) => (
                  <tr className="border-b border-[#edf2ee]" key={supplier.rut}>
                    <td className="py-3 pr-4">{supplier.razonSocial}</td>
                    <td className="py-3 pr-4">{supplier.rut}</td>
                    <td className="py-3 pr-4">Pendiente</td>
                    <td className="py-3 pr-4">Proveedor</td>
                    <td className="py-3 pr-4">Pendiente</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
