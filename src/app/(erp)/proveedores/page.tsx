import { AlertTriangle, Building2, CreditCard, MailWarning, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SupplierProfileDirectory } from "@/components/suppliers/supplier-profile-directory";
import { MetricCard, PremiumPanel } from "@/components/ui/enterprise";
import { suppliersMaster } from "@/lib/suppliers/master";
import { formatClp } from "@/lib/dte/purchases-data";
import { getSupplierPaymentProfiles } from "@/lib/suppliers/supabase-profiles";

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  const params = await searchParams;
  const suppliers = await getSupplierPaymentProfiles();
  const pending = suppliers.reduce((sum, supplier) => sum + supplier.pending, 0);
  const missingBank = suppliers.filter((supplier) => supplier.missingPaymentFields.includes("banco") || supplier.missingPaymentFields.includes("numero de cuenta"));
  const missingEmail = suppliers.filter((supplier) => supplier.missingPaymentFields.includes("email de pagos"));
  const withDebt = suppliers.filter((supplier) => supplier.pending > 0);

  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">
              Master proveedores jesus
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Proveedores
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Fichas financieras construidas desde el Excel real de proveedores,
              cruzadas con facturas XML, deuda pendiente, datos bancarios y alertas operativas.
            </p>
          </div>
        </PremiumPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            detail={`${suppliersMaster.stats.duplicateRuts.length} RUT duplicados detectados en master`}
            href="/proveedores?filter=duplicados"
            label="Proveedores master"
            value={String(suppliers.length)}
          />
          <MetricCard
            detail={`${withDebt.length} proveedores con facturas XML`}
            href="/proveedores?filter=deuda"
            label="Deuda abierta"
            tone={pending > 5_000_000 ? "warning" : "neutral"}
            value={formatClp(pending)}
          />
          <MetricCard
            detail="Requieren completar banco antes de pagar"
            href="/proveedores?filter=sin-banco"
            label="Sin banco"
            tone={missingBank.length ? "critical" : "neutral"}
            value={String(missingBank.length)}
          />
          <MetricCard
            detail="Requieren correo para nomina"
            href="/proveedores?filter=sin-email"
            label="Sin email"
            tone={missingEmail.length ? "warning" : "neutral"}
            value={String(missingEmail.length)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {[
            [Building2, "Origen trazable", "Cada ficha mantiene source = master proveedores jesus."],
            [CreditCard, "Validacion bancaria", "RUT, banco, cuenta y email se validan antes de exportar pagos."],
            [ShieldCheck, "Cruce XML", "Facturas, deuda y vencimientos se cruzan por RUT emisor."],
            [AlertTriangle, "Duplicados", `${suppliersMaster.stats.duplicateRuts.length} RUT duplicados quedan visibles para depuracion.`],
            [MailWarning, "Correos faltantes", `${suppliersMaster.stats.missingEmail} proveedores sin email en el Excel.`]
          ].map(([Icon, title, detail]) => {
            const TypedIcon = Icon as typeof Building2;
            return (
              <div className="rounded-2xl border border-[#eadfd9] bg-white p-4 shadow-sm" key={String(title)}>
                <TypedIcon className="h-5 w-5 text-brand-700" />
                <p className="mt-3 font-semibold text-brand-900">{String(title)}</p>
                <p className="mt-1 text-sm text-[#6f6263]">{String(detail)}</p>
              </div>
            );
          })}
        </div>

        <Suspense fallback={<div className="rounded-2xl border border-[#eadfd9] bg-white p-6 text-sm text-[#6f6263]">Cargando proveedores...</div>}>
            <SupplierProfileDirectory initialSelectedId={params.supplier} initialSuppliers={suppliers} />
        </Suspense>
      </section>
    </AppShell>
  );
}
