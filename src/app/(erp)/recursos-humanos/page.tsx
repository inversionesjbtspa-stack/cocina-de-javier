import { AppShell } from "@/components/layout/app-shell";
import { HrDashboardClient } from "@/components/hr/hr-dashboard-client";
import { getHrDashboardData } from "@/lib/hr/data";

export default async function RecursosHumanosPage() {
  const data = await getHrDashboardData();

  return (
    <AppShell>
      <section className="space-y-6">
        <div className="rounded-lg border border-[#dfe4dd] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            Recursos Humanos
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-900">
            RRHH operativo
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            Trabajadores, liquidaciones, vacaciones, papeletas, cuentas bancarias y nominas de pago usando el Template Pagos JESUS.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-brand-700">
            {["Trabajadores", "Liquidaciones", "Vacaciones", "Papeletas", "Bancos / pagos", "Documentos", "Anticipos", "Bonos"].map((item) => (
              <span className="rounded-full border border-[#eadfd9] bg-brand-50 px-3 py-1" key={item}>{item}</span>
            ))}
          </div>
        </div>

        <HrDashboardClient data={data} />
      </section>
    </AppShell>
  );
}
