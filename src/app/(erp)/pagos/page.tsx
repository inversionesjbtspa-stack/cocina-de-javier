import { AppShell } from "@/components/layout/app-shell";

const financeFlow = [
  "DTE validado crea cuenta por pagar",
  "Finanzas aprueba saldo y vencimiento",
  "Lote Santander agrupa documentos aprobados",
  "Archivo bancario se genera versionado en Storage",
  "Conciliacion futura actualiza estados de pago"
];

const financeTables = [
  "accounts_payable",
  "payment_batches",
  "payment_batch_items",
  "payment_files",
  "budgets",
  "budget_lines",
  "report_exports",
  "v_financial_dashboard"
];

export default function PagosPage() {
  return (
    <AppShell>
      <section className="space-y-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            Finanzas
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-900">
            Cuentas por pagar y pagos Santander
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            Base financiera para transformar DTE aprobados en cuentas por pagar,
            preparar lotes Santander, versionar archivos bancarios y generar
            reportes Excel/PDF de forma trazable.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Flujo financiero
            </h2>
            <ol className="mt-4 space-y-3">
              {financeFlow.map((item, index) => (
                <li className="flex gap-3 text-sm leading-6 text-[#4e5a52]" key={item}>
                  <span className="font-semibold text-brand-700">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Tablas y vistas
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {financeTables.map((table) => (
                <span
                  className="rounded-md bg-[#edf2ee] px-3 py-2 text-sm font-medium text-brand-700"
                  key={table}
                >
                  {table}
                </span>
              ))}
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
