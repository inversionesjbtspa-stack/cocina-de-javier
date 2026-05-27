import { CheckCircle2, FileCheck2, FileText, ShieldCheck, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { SyncXmlButton } from "@/components/dte/sync-xml-button";
import { MetricCard, PremiumPanel, StatusPill } from "@/components/ui/enterprise";
import { formatClp, formatDate } from "@/lib/dte/purchases-data";
import { createErpMetrics } from "@/lib/finance/erp-metrics";
import { getDtePurchaseData } from "@/lib/dte/supabase-data";
import { getDteOperationalInvoices } from "@/lib/dte/invoice-operations";
import { InvoiceDayDirectory } from "@/components/dte/invoice-day-directory";
import { RepairConsistencyButton } from "@/components/dte/repair-consistency-button";

export default async function FacturasPage() {
  const [dteData, operationalInvoices] = await Promise.all([getDtePurchaseData(), getDteOperationalInvoices()]);
  const metrics = createErpMetrics(dteData);
  const invoices = metrics.currentMonthInvoices.slice(0, 12);
  const total = invoices.reduce((sum, invoice) => sum + invoice.montoTotal, 0);
  const creditNotes = invoices.filter((invoice) => invoice.tipoDte === "61");
  const parsedItems = invoices.reduce((sum, invoice) => sum + invoice.items.length, 0);

  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">
              Contabilidad DTE Chile
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Facturas DTE y PDF
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Visor tributario con XML original, items, referencias, TED/CAF,
              PDF corporativo, trazabilidad, matching y auditoria financiera.
            </p>
          </div>
        </PremiumPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard detail="XML recibidos + SII pendientes + manuales" href="/facturas?filter=documentos" label="Documentos" value={String(dteData.invoiceCount)} />
          <MetricCard detail="Muestra mensual con IVA" href="/facturas?filter=monto" label="Monto facturado" value={formatClp(total)} />
          <MetricCard detail="Ajustes tributarios recibidos" href="/facturas?tipo=61" label="Notas credito" tone={creditNotes.length ? "warning" : "neutral"} value={String(creditNotes.length)} />
          <MetricCard detail="Lineas de detalle parseadas" href="/facturas?filter=items" label="Items XML" value={String(parsedItems)} />
        </div>
        <InvoiceDayDirectory invoices={operationalInvoices} />

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <PremiumPanel className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">
                  Visor de factura enterprise
                </h2>
                <p className="mt-1 text-sm text-[#6f6263]">
                  Representacion visual desde XML con acciones de PDF y XML original.
                </p>
                <p className="mt-2 text-xs text-[#7b6f70]">
                  Ultima sincronizacion: {new Date(dteData.generatedAt).toLocaleString("es-CL")} · Proxima: cron Vercel cada 10 minutos
                </p>
              </div>
              <div className="flex flex-wrap gap-2"><SyncXmlButton /><RepairConsistencyButton /></div>
            </div>

            <div className="mt-5 space-y-4">
              {invoices.map((invoice) => (
                <div className="rounded-lg border border-[#eadfd9] bg-[#fffdfb] p-5" key={`${invoice.rutEmisor}-${invoice.folio}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                        {invoice.documentType}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-brand-900">
                        Folio {invoice.folio}
                      </h3>
                      <p className="mt-2 text-sm text-[#6f6263]">
                        {invoice.razonSocialEmisor} · RUT {invoice.rutEmisor}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone={invoice.xmlStatus === "missing" ? "warning" : invoice.tipoDte === "61" ? "warning" : "success"}>
                        {invoice.xmlStatus === "missing" ? "Pendiente XML" : invoice.tipoDte === "61" ? "Nota credito" : "Validado"}
                      </StatusPill>
                      <StatusPill>{invoice.xmlStatus === "missing" ? "Pendiente XML" : "XML asociado"}</StatusPill>
                      <StatusPill>{invoice.xmlStatus === "missing" ? "PDF no disponible" : "PDF versionado"}</StatusPill>
                      <StatusPill>{invoice.sourceLabel ?? "XML"}</StatusPill>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-[#7b6f70]">Fecha emision</p>
                      <p className="mt-1 font-semibold text-brand-900">{formatDate(invoice.fechaEmision)}</p>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-[#7b6f70]">Vencimiento</p>
                      <p className="mt-1 font-semibold text-brand-900">{formatDate(invoice.fechaVencimiento)}</p>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-[#7b6f70]">IVA</p>
                      <p className="mt-1 font-semibold text-brand-900">{formatClp(invoice.iva)}</p>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-[#7b6f70]">Total</p>
                      <p className="mt-1 font-semibold text-brand-900">{formatClp(invoice.montoTotal)}</p>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-md border border-[#eadfd9]">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-brand-50 text-xs uppercase text-brand-700">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.items.slice(0, 5).map((item) => (
                          <tr className="border-t border-[#f0e5df]" key={`${invoice.folio}-${item.lineNumber}`}>
                            <td className="px-3 py-2 text-[#4d3f42]">{item.description}</td>
                            <td className="px-3 py-2 text-right">{item.quantity.toLocaleString("es-CL")}</td>
                            <td className="px-3 py-2 text-right">{formatClp(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-brand-700">{formatClp(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {invoice.xmlStatus === "missing" ? (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        XML pendiente · reenviar a dte@lacocinadejavier.cl
                      </span>
                    ) : (
                      <>
                        <a className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white" href={`/api/invoices/${invoice.folio}/pdf`} target="_blank">
                          Preview PDF
                        </a>
                        <a className="rounded-md border border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700" href={`/api/invoices/${invoice.folio}/pdf?download=1`}>
                          Descargar PDF
                        </a>
                        <a className="rounded-md border border-[#eadfd9] px-3 py-2 text-xs font-semibold text-brand-700" href={`/api/invoices/${invoice.folio}/xml`}>
                          Descargar XML
                        </a>
                        <a className="rounded-md border border-[#eadfd9] px-3 py-2 text-xs font-semibold text-brand-700" href={`/api/invoices/${invoice.folio}/pdf`} target="_blank">
                          Imprimir
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PremiumPanel>

          <aside className="space-y-4">
            <PremiumPanel className="p-5">
              <h2 className="text-lg font-semibold text-brand-900">
                Pipeline automatico Gmail
              </h2>
              <div className="mt-4 space-y-3">
                {[
                  [UploadCloud, "Leer correo", "Filtro Gmail para XML adjuntos DTE."],
                  [FileCheck2, "Persistir XML", "Storage privado, SHA-256 e idempotencia."],
                  [FileText, "Crear factura", "DTE, items, referencias y cuenta por pagar."],
                  [ShieldCheck, "Auditoria", "Evento por documento procesado."],
                  [CheckCircle2, "Estados", "Pendiente, validado, pagado o rechazado."]
                ].map(([Icon, title, detail]) => {
                  const TypedIcon = Icon as typeof UploadCloud;
                  return (
                    <div className="flex gap-3 rounded-md border border-[#eadfd9] p-3" key={String(title)}>
                      <TypedIcon className="mt-0.5 h-4 w-4 text-brand-700" />
                      <div>
                        <p className="text-sm font-semibold text-brand-900">{String(title)}</p>
                        <p className="text-xs text-[#6f6263]">{String(detail)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PremiumPanel>

            <PremiumPanel className="p-5">
              <h2 className="text-lg font-semibold text-brand-900">
                Trazabilidad factura
              </h2>
              <div className="mt-5 space-y-4 border-l border-[#eadfd9] pl-4">
                {[
                  "XML recibido desde Gmail",
                  "Hash SHA-256 calculado",
                  "Proveedor actualizado",
                  "Cuenta por pagar creada",
                  "PDF listo para revision",
                  "Pendiente matching OC/recepcion"
                ].map((event) => (
                  <div className="relative text-sm text-[#4d3f42]" key={event}>
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-700" />
                    {event}
                  </div>
                ))}
              </div>
            </PremiumPanel>
          </aside>
        </section>
      </section>
    </AppShell>
  );
}
