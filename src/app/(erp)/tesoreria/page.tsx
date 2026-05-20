import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileSpreadsheet,
  Landmark,
  Search,
  ShieldAlert,
  WalletCards
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PaymentNominaPanel } from "@/components/payments/payment-nomina-panel";
import {
  createErpMetrics,
  severityLabel,
  statusTone
} from "@/lib/finance/erp-metrics";
import { formatClp, formatDate } from "@/lib/dte/purchases-data";
import { getDtePurchaseData } from "@/lib/dte/supabase-data";
import { paymentValidation } from "@/lib/suppliers/master";

function Badge({
  children,
  severity = "healthy"
}: {
  children: string;
  severity?: "healthy" | "warning" | "critical";
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(severity).badge}`}>
      {children}
    </span>
  );
}

export default async function TesoreriaPage() {
  const dteData = await getDtePurchaseData();
  const metrics = createErpMetrics(dteData);
  const today = metrics.invoicesDueWithin(0);
  const due7 = metrics.invoicesDueWithin(7);
  const due15 = metrics.invoicesDueWithin(15);
  const due30 = metrics.invoicesDueWithin(30);
  const overdue = metrics.overdueInvoices();
  const duplicates = metrics.duplicateRiskInvoices();
  const risk = metrics.riskStatus();
  const criticalSuppliers = metrics.supplierSpend(6);
  const prepared = due30.slice(0, 12);
  const due7LastDate = due7.at(-1)?.fechaVencimiento;
  const paymentCandidates = due30
    .filter((invoice) => invoice.tipoDte !== "61")
    .slice(0, 80)
    .map((invoice) => {
      const validation = paymentValidation(invoice);
      return {
        alerts: validation.alerts,
        bankAccount: validation.supplier?.bankAccount ?? "",
        bankCode: validation.supplier?.bankCode ?? "",
        bankName: validation.supplier?.bankName ?? "",
        email: validation.supplier?.email ?? "",
        invoice,
        ok: validation.ok,
        supplierName: validation.supplier?.businessName ?? invoice.razonSocialEmisor
      };
    });

  const summary = [
    {
      detail: `${today.length} documentos`,
      icon: Clock3,
      label: "Pagos hoy",
      severity: today.length ? "warning" : "healthy",
      value: formatClp(metrics.totalAmount(today))
    },
    {
      detail: `${overdue.length} documentos vencidos`,
      icon: AlertTriangle,
      label: "Pagos vencidos",
      severity: overdue.length ? "critical" : "healthy",
      value: formatClp(metrics.totalAmount(overdue))
    },
    {
      detail: `${prepared.length} documentos listos`,
      icon: FileSpreadsheet,
      label: "Pagos preparados",
      severity: prepared.length > 10 ? "warning" : "healthy",
      value: formatClp(metrics.totalAmount(prepared))
    },
    {
      detail: "Control 4 ojos pendiente",
      icon: CheckCircle2,
      label: "Pagos aprobados",
      severity: "healthy",
      value: formatClp(0)
    },
    {
      detail: "Salida estimada 30 dias",
      icon: CircleDollarSign,
      label: "Flujo proyectado",
      severity: Math.abs(metrics.projectedCashFlow()) > 10_000_000 ? "critical" : "warning",
      value: formatClp(metrics.projectedCashFlow())
    },
    {
      detail: duplicates ? `${duplicates} alertas duplicado` : "Sin duplicados",
      icon: ShieldAlert,
      label: "Riesgo financiero",
      severity: risk,
      value: severityLabel(risk)
    }
  ] as const;

  return (
    <AppShell>
      <section className="space-y-8">
        <div className="rounded-lg border border-[#dfe4dd] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                Panel financiero corporativo
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-900">
                Tesoreria
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
                Programacion de pagos, vencimientos, aprobaciones y riesgo
                financiero. Corte operativo: {formatDate(metrics.operatingDate)}.
              </p>
            </div>
            <a
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
              href="#nomina-pagos"
            >
              <WalletCards className="h-4 w-4" />
              Generar pagos
            </a>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summary.map((card) => {
            const Icon = card.icon;
            return (
              <article
                className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm"
                key={card.label}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#667068]">
                      {card.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-brand-900">
                      {card.value}
                    </p>
                    <p className="mt-2 text-sm text-[#667068]">{card.detail}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${statusTone(card.severity).panel}`}>
                    <Icon className={`h-5 w-5 ${statusTone(card.severity).text}`} />
                  </div>
                </div>
                <div className="mt-4">
                  <Badge severity={card.severity}>{severityLabel(card.severity)}</Badge>
                </div>
              </article>
            );
          })}
        </div>

        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-semibold text-brand-900">
                Proximos pagos
              </h2>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Hoy", today.length, metrics.totalAmount(today), today.length ? "warning" : "healthy"],
                ["7 dias", due7.length, metrics.totalAmount(due7), due7.length > 5 ? "warning" : "healthy"],
                ["15 dias", due15.length, metrics.totalAmount(due15), due15.length > 10 ? "warning" : "healthy"],
                ["30 dias", due30.length, metrics.totalAmount(due30), due30.length > 20 ? "critical" : "warning"]
              ].map(([label, count, amount, severity]) => (
                <div
                  className={`rounded-lg border p-4 ${statusTone(severity as "healthy" | "warning" | "critical").panel}`}
                  key={label}
                >
                  <p className="text-xs font-semibold uppercase text-[#667068]">
                    {String(label)}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-brand-900">
                    {formatClp(Number(amount))}
                  </p>
                  <p className="mt-1 text-sm text-[#667068]">
                    {String(count)} documentos
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <label className="block md:col-span-2">
                <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
                  <Search className="h-4 w-4" />
                  Buscar pago
                </span>
                <input
                  className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm"
                  placeholder="Proveedor, folio o RUT"
                  type="search"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#5d665f]">Estado</span>
                <select className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm">
                  <option>Pendiente</option>
                  <option>Preparado</option>
                  <option>Aprobado</option>
                  <option>Vencido</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#5d665f]">Vencimiento</span>
                <select className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm">
                  <option>Mas cercano</option>
                  <option>Mayor monto</option>
                  <option>Proveedor</option>
                </select>
              </label>
            </div>

            <div className="mt-5 max-h-[560px] overflow-auto rounded-lg border border-[#e6ebe5]">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-[#f8faf8]">
                  <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
                    <th className="px-4 py-3">Vencimiento</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Factura</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.pendingPayables
                    .slice()
                    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
                    .slice(0, 80)
                    .map((invoice) => {
                      const isOverdue = invoice.fechaVencimiento < metrics.operatingDate;
                      const severity = isOverdue
                        ? "critical"
                        : due7LastDate && invoice.fechaVencimiento <= due7LastDate
                          ? "warning"
                          : "healthy";

                      return (
                        <tr
                          className="border-b border-[#edf2ee] bg-white hover:bg-[#f8faf8]"
                          key={`${invoice.rutEmisor}-${invoice.folio}`}
                        >
                          <td className="px-4 py-3 font-medium text-brand-900">
                            {formatDate(invoice.fechaVencimiento)}
                          </td>
                          <td className="px-4 py-3 text-[#4e5a52]">
                            {invoice.razonSocialEmisor}
                          </td>
                          <td className="px-4 py-3 text-[#4e5a52]">
                            {invoice.folio}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-brand-700">
                            {formatClp(invoice.montoTotal)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge severity={isOverdue ? "critical" : "warning"}>
                              {isOverdue ? "Vencido" : "Pendiente"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge severity={severity}>
                              {severityLabel(severity)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-brand-900">
                Proveedores criticos
              </h2>
              <div className="mt-4 space-y-4">
                {criticalSuppliers.map((supplier, index) => (
                  <div
                    className="flex items-center justify-between gap-4 border-b border-[#edf2ee] pb-3 last:border-0 last:pb-0"
                    key={supplier.supplier}
                  >
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
                ))}
              </div>
            </article>

            <article className={`rounded-lg border p-5 shadow-sm ${statusTone(risk).panel}`}>
              <div className="flex items-center gap-2">
                <ShieldAlert className={`h-5 w-5 ${statusTone(risk).text}`} />
                <h2 className="text-lg font-semibold text-brand-900">
                  Riesgo financiero
                </h2>
              </div>
              <p className="mt-4 text-3xl font-semibold text-brand-900">
                {severityLabel(risk)}
              </p>
              <p className="mt-2 text-sm text-[#4e5a52]">
                {duplicates
                  ? "Existen posibles duplicados por RUT, tipo DTE y folio."
                  : "No hay duplicados detectados por RUT, tipo DTE y folio."}
              </p>
              <p className="mt-3 text-sm font-semibold text-brand-700">
                Cuentas por pagar: {formatClp(metrics.totalAmount(metrics.pendingPayables))}
              </p>
            </article>
          </aside>
        </section>

        <PaymentNominaPanel candidates={paymentCandidates} />
      </section>
    </AppShell>
  );
}
