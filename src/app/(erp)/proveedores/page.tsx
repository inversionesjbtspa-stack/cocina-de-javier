import { AlertTriangle, Building2, FileText, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MetricCard, PremiumPanel, ProgressBar, StatusPill } from "@/components/ui/enterprise";
import { supplierProfiles } from "@/lib/finance/enterprise-analytics";
import { formatClp } from "@/lib/dte/purchases-data";

export default function ProveedoresPage() {
  const suppliers = supplierProfiles(14);
  const critical = suppliers.filter((supplier) => supplier.risk === "critical");
  const pending = suppliers.reduce((sum, supplier) => sum + supplier.pending, 0);
  const historical = suppliers.reduce((sum, supplier) => sum + supplier.total, 0);
  const top = suppliers[0];

  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">
              CRM financiero de proveedores
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Proveedores
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Vista ejecutiva de comportamiento financiero, riesgo, deuda,
              documentos DTE, productos asociados e historial operativo por proveedor.
            </p>
          </div>
        </PremiumPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            detail={`${suppliers.length} fichas activas desde XML DTE`}
            label="Proveedores"
            value={String(suppliers.length)}
          />
          <MetricCard
            detail="Cuentas no marcadas como pagadas"
            label="Deuda abierta"
            tone={pending > 5_000_000 ? "warning" : "neutral"}
            value={formatClp(pending)}
          />
          <MetricCard
            detail="Compras historicas normalizadas"
            label="Monto historico"
            value={formatClp(historical)}
          />
          <MetricCard
            detail={top?.name ?? "Sin informacion"}
            label="Top proveedor"
            value={top?.totalClp ?? "$0"}
          />
        </div>

        <PremiumPanel className="p-5">
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="block lg:col-span-2">
              <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
                <Search className="h-4 w-4" />
                Buscar proveedor
              </span>
              <input
                className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm"
                placeholder="RUT, razon social, producto o categoria"
                type="search"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#6f6263]">Riesgo</span>
              <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm">
                <option>Todos</option>
                <option>Critico</option>
                <option>Atencion</option>
                <option>Saludable</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#6f6263]">Categoria</span>
              <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm">
                <option>Todas</option>
                <option>Alimentos</option>
                <option>Bebidas</option>
                <option>Servicios</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#6f6263]">Orden</span>
              <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm">
                <option>Mayor monto</option>
                <option>Mayor deuda</option>
                <option>Mayor riesgo</option>
              </select>
            </label>
          </div>
        </PremiumPanel>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <PremiumPanel className="overflow-hidden">
            <div className="border-b border-[#eadfd9] px-5 py-4">
              <h2 className="text-lg font-semibold text-brand-900">
                Fichas ejecutivas
              </h2>
            </div>
            <div className="divide-y divide-[#f0e5df]">
              {suppliers.map((supplier) => (
                <div className="grid gap-4 p-5 xl:grid-cols-[1fr_0.85fr]" key={supplier.rut}>
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-brand-900">
                          {supplier.name}
                        </p>
                        <p className="mt-1 text-sm text-[#6f6263]">
                          RUT {supplier.rut} · {supplier.documents} documentos · {supplier.productsCount} productos
                        </p>
                      </div>
                      <StatusPill tone={supplier.risk}>
                        Score {supplier.score}
                      </StatusPill>
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 flex justify-between text-xs font-semibold uppercase text-[#7b6f70]">
                        <span>Riesgo financiero</span>
                        <span>{supplier.score}/100</span>
                      </div>
                      <ProgressBar value={supplier.score} tone={supplier.risk === "critical" ? "gold" : "brand"} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md bg-brand-50 p-3">
                      <p className="text-xs text-[#7b6f70]">Historico</p>
                      <p className="mt-1 font-semibold text-brand-900">{supplier.totalClp}</p>
                    </div>
                    <div className="rounded-md bg-brand-50 p-3">
                      <p className="text-xs text-[#7b6f70]">Pendiente</p>
                      <p className="mt-1 font-semibold text-brand-900">{supplier.pendingClp}</p>
                    </div>
                    <div className="rounded-md bg-brand-50 p-3">
                      <p className="text-xs text-[#7b6f70]">Vencido</p>
                      <p className="mt-1 font-semibold text-brand-900">{supplier.overdueClp}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PremiumPanel>

          <aside className="space-y-4">
            <PremiumPanel className="p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-700" />
                <h2 className="text-lg font-semibold text-brand-900">
                  Control de riesgo
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {critical.length ? (
                  critical.map((supplier) => (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3" key={supplier.rut}>
                      <p className="text-sm font-semibold text-red-800">{supplier.name}</p>
                      <p className="mt-1 text-xs text-red-700">Vencido: {supplier.overdueClp}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    Sin proveedores bloqueados ni vencimientos criticos detectados.
                  </div>
                )}
              </div>
            </PremiumPanel>

            <PremiumPanel className="p-5">
              <h2 className="text-lg font-semibold text-brand-900">
                Tabs de ficha proveedor
              </h2>
              <div className="mt-4 grid gap-2">
                {[
                  [Building2, "General", "Razon social, RUT, giro, contactos y ejecutivo."],
                  [TrendingUp, "Financiero", "Deuda, promedio mensual, vencidos y credito utilizado."],
                  [FileText, "Documentos", "XML, PDFs, OC, contratos y adjuntos."],
                  [AlertTriangle, "Analitica", "Variaciones, productos, incidencias y auditoria."]
                ].map(([Icon, title, detail]) => {
                  const TypedIcon = Icon as typeof Building2;
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
          </aside>
        </section>
      </section>
    </AppShell>
  );
}
