import { CalendarDays, Download, FileSpreadsheet, Landmark, WalletCards } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MetricCard, PremiumPanel, ProgressBar, StatusPill } from "@/components/ui/enterprise";
import { cashflowDays } from "@/lib/finance/enterprise-analytics";
import { formatClp, formatDate } from "@/lib/dte/purchases-data";
import { invoicesDueWithin, overdueInvoices, pendingPayables, totalAmount } from "@/lib/finance/erp-metrics";

export default function PagosPage() {
  const overdue = overdueInvoices();
  const due30 = invoicesDueWithin(30);
  const cashflow = cashflowDays();
  const maxDay = cashflow[0]?.total ?? 1;
  const prepared = due30.slice(0, 18);

  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">
              Gestor de pagos enterprise
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Cuentas por pagar y Santander
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Digitalizacion del flujo manual: factura entra, pasa a nomina,
              se programa en flujo de caja, se aprueba, se paga y cambia estado.
            </p>
          </div>
        </PremiumPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard detail={`${pendingPayables.length} documentos`} label="Pendiente" value={formatClp(totalAmount(pendingPayables))} />
          <MetricCard detail={`${overdue.length} vencidas`} label="Vencido" tone={overdue.length ? "critical" : "neutral"} value={formatClp(totalAmount(overdue))} />
          <MetricCard detail={`${prepared.length} seleccionables`} label="Nomina preparada" tone="warning" value={formatClp(totalAmount(prepared))} />
          <MetricCard detail="Control 4 ojos" label="Aprobado" tone="success" value={formatClp(0)} />
          <MetricCard detail="Formato banco exportable" label="Santander" value="Excel" />
        </div>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <PremiumPanel className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-brand-700" />
                <div>
                  <h2 className="text-lg font-semibold text-brand-900">
                    Flujo de caja diario
                  </h2>
                  <p className="text-sm text-[#6f6263]">
                    Pagos programados por vencimiento y prioridad financiera.
                  </p>
                </div>
              </div>
              <a
                className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
                href="/api/payment-template"
              >
                <Download className="h-4 w-4" />
                Exportar Santander
              </a>
            </div>

            <div className="mt-5 space-y-4">
              {cashflow.map((day) => (
                <div className="rounded-lg border border-[#eadfd9] bg-[#fffdfb] p-4" key={day.date}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-900">
                        {formatDate(day.date)}
                      </p>
                      <p className="text-xs text-[#6f6263]">
                        {day.invoices} facturas programadas
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-brand-700">
                      {day.totalClp}
                    </p>
                  </div>
                  <div className="mt-3">
                    <ProgressBar tone="gold" value={(day.total / maxDay) * 100} />
                  </div>
                </div>
              ))}
            </div>
          </PremiumPanel>

          <aside className="space-y-4">
            <PremiumPanel className="p-5">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-brand-700" />
                <h2 className="text-lg font-semibold text-brand-900">
                  Flujo operacional
                </h2>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["1", "Factura entra", "DTE crea cuenta por pagar"],
                  ["2", "Pasa a nomina", "Finanzas selecciona documentos"],
                  ["3", "Programa fecha", "Impacta flujo diario"],
                  ["4", "Aprueba", "Control 4 ojos"],
                  ["5", "Paga", "Estado pagado y auditoria"]
                ].map(([step, title, detail]) => (
                  <div className="flex gap-3 rounded-md border border-[#eadfd9] p-3" key={step}>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                      {step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-brand-900">{title}</p>
                      <p className="text-xs text-[#6f6263]">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumPanel>

            <PremiumPanel className="p-5">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-brand-700" />
                <h2 className="text-lg font-semibold text-brand-900">
                  Estados de pago
                </h2>
              </div>
              <div className="mt-4 grid gap-2">
                {["Pendiente", "Aprobado", "Programado", "Enviado banco", "Pagado", "Rechazado", "Parcial"].map((state, index) => (
                  <div className="flex items-center justify-between rounded-md border border-[#eadfd9] px-3 py-2" key={state}>
                    <span className="text-sm font-medium text-brand-900">{state}</span>
                    <StatusPill tone={index < 3 ? "warning" : index === 4 ? "success" : "neutral"}>
                      Activo
                    </StatusPill>
                  </div>
                ))}
              </div>
            </PremiumPanel>
          </aside>
        </section>

        <PremiumPanel className="overflow-hidden">
          <div className="border-b border-[#eadfd9] px-5 py-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-semibold text-brand-900">
                Nomina manual digitalizada
              </h2>
            </div>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[#fffaf7]">
                <tr className="border-b border-[#eadfd9] text-left text-xs uppercase text-brand-700">
                  <th className="px-4 py-3">Seleccion</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {prepared.map((invoice) => (
                  <tr className="border-b border-[#f0e5df] hover:bg-brand-50" key={`${invoice.rutEmisor}-${invoice.folio}`}>
                    <td className="px-4 py-3">
                      <input className="h-4 w-4 accent-brand-700" defaultChecked type="checkbox" />
                    </td>
                    <td className="px-4 py-3">{formatDate(invoice.fechaVencimiento)}</td>
                    <td className="px-4 py-3 font-medium text-brand-900">{invoice.razonSocialEmisor}</td>
                    <td className="px-4 py-3">{invoice.folio}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-700">{formatClp(invoice.montoTotal)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={invoice.fechaVencimiento < new Date().toISOString().slice(0, 10) ? "critical" : "warning"}>
                        Pendiente
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PremiumPanel>
      </section>
    </AppShell>
  );
}
