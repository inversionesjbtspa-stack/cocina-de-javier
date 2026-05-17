import {
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  UserCog,
  WalletCards
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { operatingDate, statusTone } from "@/lib/finance/erp-metrics";
import { formatDate, purchasesData } from "@/lib/dte/purchases-data";

const events = [
  {
    action: "XML DTE procesado",
    detail: `${purchasesData.invoiceCount} documentos cargados y deduplicados por RUT/tipo/folio`,
    icon: FileCheck2,
    module: "DTE",
    status: "OK",
    time: "19:24",
    user: "Sistema"
  },
  {
    action: "Dashboard financiero actualizado",
    detail: "KPIs ejecutivos recalculados desde compras, IVA y notas de credito",
    icon: RefreshCw,
    module: "Dashboard",
    status: "OK",
    time: "19:25",
    user: "Sistema"
  },
  {
    action: "Planilla de pagos generada",
    detail: "Formato base Santander disponible para facturas pendientes",
    icon: WalletCards,
    module: "Tesoreria",
    status: "Atencion",
    time: "19:26",
    user: "Finanzas"
  },
  {
    action: "Proveedor actualizado",
    detail: "Ficha bancaria y contacto quedan pendientes de validacion formal",
    icon: UserCog,
    module: "Proveedores",
    status: "Atencion",
    time: "19:27",
    user: "Administrador"
  },
  {
    action: "Build cloud validado",
    detail: "Next.js compilo rutas ERP, APIs PDF y exportacion Excel",
    icon: CheckCircle2,
    module: "Deploy",
    status: "OK",
    time: "19:58",
    user: "Codex"
  }
];

function statusClass(status: string) {
  return status === "OK" ? statusTone("healthy").badge : statusTone("warning").badge;
}

export default function AuditoriaPage() {
  return (
    <AppShell>
      <section className="space-y-8">
        <div className="rounded-lg border border-[#dfe4dd] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                Trazabilidad empresarial
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-900">
                Auditoria y logs
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
                Timeline operativo para acciones sensibles, XML DTE, pagos,
                proveedores y cambios del sistema. Corte: {formatDate(operatingDate)}.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              Registro append-only preparado
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Eventos auditables", String(events.length), ShieldCheck],
            ["Documentos DTE", String(purchasesData.invoiceCount), Database],
            ["Ultima actividad", "19:58", Clock3]
          ].map(([label, value, Icon]) => (
            <article
              className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm"
              key={String(label)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#667068]">{String(label)}</p>
                  <p className="mt-3 text-2xl font-semibold text-brand-900">
                    {String(value)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#dfe4dd] bg-[#f8faf8] p-3">
                  <Icon className="h-5 w-5 text-brand-700" />
                </div>
              </div>
            </article>
          ))}
        </div>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-900">
                Timeline de actividad
              </h2>
              <p className="mt-1 text-sm text-[#667068]">
                Usuario, accion, modulo, fecha/hora, estado y detalle.
              </p>
            </div>
            <input
              className="w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm md:w-72"
              placeholder="Buscar evento"
              type="search"
            />
          </div>

          <div className="mt-6 space-y-0">
            {events.map((event, index) => {
              const Icon = event.icon;

              return (
                <div className="grid grid-cols-[88px_1fr] gap-4" key={event.action}>
                  <div className="text-right text-sm font-semibold text-brand-700">
                    {event.time}
                  </div>
                  <div className="relative border-l border-[#dfe4dd] pb-6 pl-6">
                    <span className="absolute -left-[9px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-white">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-700" />
                    </span>
                    <div className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-3">
                          <div className="rounded-lg border border-[#dfe4dd] bg-white p-2">
                            <Icon className="h-4 w-4 text-brand-700" />
                          </div>
                          <div>
                            <p className="font-semibold text-brand-900">
                              {event.action}
                            </p>
                            <p className="mt-1 text-sm text-[#5d665f]">
                              {event.detail}
                            </p>
                          </div>
                        </div>
                        <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 text-xs text-[#667068] md:grid-cols-3">
                        <span>Usuario: {event.user}</span>
                        <span>Modulo: {event.module}</span>
                        <span>Fecha: {formatDate(operatingDate)}</span>
                      </div>
                    </div>
                    {index === events.length - 1 ? null : null}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
