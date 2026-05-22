import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  Landmark,
  ReceiptText,
  ShieldAlert,
  TrendingUp
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { BrandLogo } from "@/components/brand/logo";
import {
  createErpMetrics,
  severityLabel,
  statusTone
} from "@/lib/finance/erp-metrics";
import {
  formatClp,
  formatDate,
  formatMonth,
  totalsFor
} from "@/lib/dte/purchases-data";
import { getDtePurchaseData } from "@/lib/dte/supabase-data";
import { getIntelligentPriceAlerts } from "@/lib/finance/price-alerts";
import { PriceAlertPanel } from "@/components/finance/price-alert-panel";

function StatusBadge({
  label,
  severity
}: {
  label?: string;
  severity: "healthy" | "warning" | "critical";
}) {
  const tone = statusTone(severity);

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone.badge}`}>
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
      {label ?? severityLabel(severity)}
    </span>
  );
}

export default async function HomePage() {
  const [dteData, priceAlerts] = await Promise.all([getDtePurchaseData(), getIntelligentPriceAlerts()]);
  const metrics = createErpMetrics(dteData);
  const totals = totalsFor(metrics.currentMonthInvoices);
  const overdue = metrics.overdueInvoices();
  const due7 = metrics.invoicesDueWithin(7);
  const due30 = metrics.invoicesDueWithin(30);
  const variation = metrics.monthlyCostVariation();
  const alerts = metrics.executiveAlerts();
  const risk = metrics.riskStatus();
  const suppliers = metrics.supplierSpend(5);
  const flow = metrics.projectedCashFlow();
  const topSupplier = suppliers[0];
  const alertSeverity = alerts.some((alert) => alert.severity === "critical")
    ? "critical"
    : alerts.some((alert) => alert.severity === "warning")
      ? "warning"
      : "healthy";

  const kpis = [
    {
      detail: "Salida proyectada a 30 dias",
      href: "/tesoreria?filter=flujo-30",
      icon: CircleDollarSign,
      label: "Caja / flujo estimado",
      severity: Math.abs(flow) > 10_000_000 ? "critical" : Math.abs(flow) > 5_000_000 ? "warning" : "healthy",
      value: formatClp(flow)
    },
    {
      detail: `${metrics.pendingPayables.length} documentos pendientes`,
      href: "/tesoreria?estado=pendiente",
      icon: ReceiptText,
      label: "Cuentas por pagar",
      severity: metrics.pendingPayables.length > 80 ? "critical" : metrics.pendingPayables.length > 40 ? "warning" : "healthy",
      value: formatClp(metrics.totalAmount(metrics.pendingPayables))
    },
    {
      detail: `${overdue.length} documentos fuera de plazo`,
      href: "/tesoreria?estado=vencidas",
      icon: AlertTriangle,
      label: "Facturas vencidas",
      severity: overdue.length ? "critical" : "healthy",
      value: formatClp(metrics.totalAmount(overdue))
    },
    {
      detail: formatMonth(metrics.currentMonth),
      href: `/compras?mes=${metrics.currentMonth}`,
      icon: Banknote,
      label: "Compras del mes",
      severity: totals.total > 12_000_000 ? "warning" : "healthy",
      value: formatClp(totals.total)
    },
    {
      detail: "Contra mes anterior",
      href: "/productos?filter=variacion",
      icon: variation >= 0 ? ArrowUpRight : ArrowDownRight,
      label: "Variacion mensual",
      severity: variation > 20 ? "critical" : variation > 8 ? "warning" : "healthy",
      value: `${variation.toFixed(1)}%`
    },
    {
      detail: `${alerts.filter((alert) => alert.severity !== "healthy").length} alertas con atencion`,
      href: "/auditoria?filter=alertas",
      icon: ShieldAlert,
      label: "Alertas criticas",
      severity: alertSeverity,
      value: severityLabel(alertSeverity)
    }
  ] as const;

  return (
    <AppShell>
      <section className="space-y-8">
        <div className="overflow-hidden rounded-lg border border-[#eadfd9] bg-white shadow-[0_18px_45px_rgba(43,16,24,0.06)]">
          <div className="border-b border-[#eadfd9] bg-[#fffaf6] px-6 py-5">
            <BrandLogo />
          </div>
          <div className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                  Dashboard ejecutivo
                </p>
                <StatusBadge severity={risk} />
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-900 lg:text-4xl">
                Control financiero La Cocina de Javier
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-7 text-[#6f6263]">
                Lectura ejecutiva basada en {dteData.invoiceCount} XML DTE
                procesados. Corte operativo: {formatDate(metrics.operatingDate)}.
              </p>
            </div>
            <div className="rounded-lg border border-[#eadfd9] bg-brand-50 p-4 text-sm">
              <p className="font-semibold text-brand-900">Resumen en 10 segundos</p>
              <p className="mt-2 text-[#6f6263]">
                {overdue.length
                  ? "Existen pagos vencidos que requieren gestion inmediata."
                  : "No hay facturas vencidas en el corte operativo."}
              </p>
              <p className="mt-2 font-semibold text-brand-700">
                Flujo 30 dias: {formatClp(flow)}
              </p>
            </div>
          </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kpis.map((card) => {
            const Icon = card.icon;
            const tone = statusTone(card.severity);

            return (
              <Link
                className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm"
                href={card.href}
                key={card.label}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#667068]">
                      {card.label}
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-900">
                      {card.value}
                    </p>
                    <p className="mt-2 text-sm text-[#667068]">{card.detail}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${tone.panel}`}>
                    <Icon aria-hidden="true" className={`h-5 w-5 ${tone.text}`} />
                  </div>
                </div>
                <div className="mt-5">
                  <StatusBadge severity={card.severity} />
                </div>
              </Link>
            );
          })}
        </div>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">
                  Control Financiero
                </h2>
                <p className="mt-1 text-sm text-[#667068]">
                  Pagos proximos, vencimientos, flujo estimado y presupuesto.
                </p>
              </div>
              <StatusBadge severity={risk} />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Hoy", metrics.invoicesDueWithin(0).length, metrics.totalAmount(metrics.invoicesDueWithin(0))],
                ["7 dias", due7.length, metrics.totalAmount(due7)],
                ["15 dias", metrics.invoicesDueWithin(15).length, metrics.totalAmount(metrics.invoicesDueWithin(15))],
                ["30 dias", due30.length, metrics.totalAmount(due30)]
              ].map(([label, count, amount]) => (
                <div className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-4" key={label}>
                  <p className="text-xs font-semibold uppercase text-[#667068]">
                    {label}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-brand-900">
                    {formatClp(Number(amount))}
                  </p>
                  <p className="mt-1 text-sm text-[#667068]">
                    {String(count)} pagos
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-[#e6ebe5] p-4">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-brand-700" />
                  <p className="font-semibold text-brand-900">
                    Vencimientos inmediatos
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {due30.slice(0, 5).map((invoice) => (
                    <div
                      className="flex items-center justify-between gap-4 border-b border-[#edf2ee] pb-3 last:border-0 last:pb-0"
                      key={`${invoice.rutEmisor}-${invoice.folio}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-brand-900">
                          {invoice.razonSocialEmisor}
                        </p>
                        <p className="text-xs text-[#667068]">
                          Factura {invoice.folio} · vence {formatDate(invoice.fechaVencimiento)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-brand-700">
                        {formatClp(invoice.montoTotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[#e6ebe5] p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-brand-700" />
                  <p className="font-semibold text-brand-900">Riesgo financiero</p>
                </div>
                <div className="mt-4 space-y-3">
                  {alerts.map((alert) => (
                    <div
                      className={`rounded-md border p-3 ${statusTone(alert.severity).panel}`}
                      key={alert.label}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-brand-900">
                          {alert.label}
                        </p>
                        <StatusBadge severity={alert.severity} />
                      </div>
                      <p className="mt-2 text-sm text-[#4e5a52]">{alert.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-semibold text-brand-900">
                Proveedores criticos
              </h2>
            </div>
            <div className="mt-5 space-y-4">
              {suppliers.map((supplier, index) => {
                const width = topSupplier
                  ? Math.max(8, (supplier.total / topSupplier.total) * 100)
                  : 0;

                return (
                  <div key={supplier.supplier}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-900">
                          {index + 1}. {supplier.supplier}
                        </p>
                        <p className="text-xs text-[#667068]">
                          {supplier.documents} documentos
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-brand-700">
                        {supplier.totalClp}
                      </p>
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
        </section>
        <PriceAlertPanel alerts={priceAlerts} />

        <section className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-900">
                Compras por mes
              </h2>
              <p className="mt-1 text-sm text-[#667068]">
                Comparacion mensual con documentos, notas de credito y gasto total.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
              <TrendingUp className="h-4 w-4" />
              {variation.toFixed(1)}% vs mes anterior
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                  <th className="py-3 pr-4">Mes</th>
                  <th className="py-3 pr-4 text-right">Documentos</th>
                  <th className="py-3 pr-4 text-right">Facturas</th>
                  <th className="py-3 pr-4 text-right">Notas credito</th>
                  <th className="py-3 pr-4 text-right">Total con IVA</th>
                  <th className="py-3 pr-4">Estado</th>
                </tr>
              </thead>
              <tbody>
                {dteData.summaries.byMonth.map((month, index) => {
                  const severity =
                    index === 0 && variation > 20
                      ? "critical"
                      : index === 0 && variation > 8
                        ? "warning"
                        : "healthy";

                  return (
                    <tr className="border-b border-[#edf2ee]" key={month.key}>
                      <td className="py-3 pr-4 font-medium text-brand-900">
                        {formatMonth(month.key)}
                      </td>
                      <td className="py-3 pr-4 text-right">{month.documents}</td>
                      <td className="py-3 pr-4 text-right">{month.invoices}</td>
                      <td className="py-3 pr-4 text-right">{month.creditNotes}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-brand-700">
                        {month.totalClp}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge severity={severity} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
