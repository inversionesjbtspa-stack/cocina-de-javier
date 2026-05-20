"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Building2, CreditCard, FileText, Search } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { enrichedSuppliers } from "@/lib/suppliers/master";

type SupplierRow = ReturnType<typeof enrichedSuppliers>[number];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function SupplierMasterDirectory({ suppliers }: { suppliers: SupplierRow[] }) {
  const [query, setQuery] = useState("");
  const [bank, setBank] = useState("Todos");
  const [risk, setRisk] = useState("Todos");
  const [selectedRut, setSelectedRut] = useState(suppliers[0]?.rut ?? "");

  const banks = useMemo(
    () => ["Todos", ...Array.from(new Set(suppliers.map((supplier) => supplier.bankName).filter(Boolean))).sort()],
    [suppliers]
  );

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return suppliers
      .filter((supplier) => {
        const haystack = normalize(
          [
            supplier.rut,
            supplier.businessName,
            supplier.tradeName,
            supplier.bankName,
            supplier.category,
            supplier.email,
            supplier.products.join(" ")
          ].join(" ")
        );
        return !needle || haystack.includes(needle);
      })
      .filter((supplier) => bank === "Todos" || supplier.bankName === bank)
      .filter((supplier) => risk === "Todos" || supplier.risk === risk)
      .slice(0, 80);
  }, [bank, query, risk, suppliers]);

  const selected = suppliers.find((supplier) => supplier.rut === selectedRut) ?? filtered[0] ?? suppliers[0];

  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-[#eadfd9] bg-white shadow-sm">
        <div className="border-b border-[#eadfd9] p-5">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_0.8fr]">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
                <Search className="h-4 w-4" />
                Buscar proveedor
              </span>
              <input
                className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="RUT, razon social, banco, producto o categoria"
                type="search"
                value={query}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#6f6263]">Banco</span>
              <select
                className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm"
                onChange={(event) => setBank(event.target.value)}
                value={bank}
              >
                {banks.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#6f6263]">Riesgo</span>
              <select
                className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm"
                onChange={(event) => setRisk(event.target.value)}
                value={risk}
              >
                <option>Todos</option>
                <option value="critical">Critico</option>
                <option value="warning">Atencion</option>
                <option value="success">Saludable</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-[#7b6f70]">
            {filtered.length} proveedores visibles desde master proveedores jesus.
          </p>
        </div>

        <div className="max-h-[760px] divide-y divide-[#f0e5df] overflow-y-auto">
          {filtered.map((supplier) => (
            <button
              className={[
                "grid w-full gap-3 px-5 py-4 text-left transition hover:bg-brand-50 md:grid-cols-[1fr_0.7fr_0.55fr]",
                selected?.rut === supplier.rut ? "bg-brand-50" : "bg-white"
              ].join(" ")}
              key={`${supplier.code}-${supplier.rut}`}
              onClick={() => setSelectedRut(supplier.rut)}
              type="button"
            >
              <div>
                <p className="font-semibold text-brand-900">{supplier.businessName}</p>
                <p className="mt-1 text-sm text-[#6f6263]">
                  RUT {supplier.rut} · Codigo {supplier.code || "sin codigo"}
                </p>
                {supplier.validation.alerts.length ? (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {supplier.validation.alerts.length} alerta(s)
                  </p>
                ) : null}
              </div>
              <div className="text-sm text-[#4d3f42]">
                <p>{supplier.bankName || "Banco no informado"}</p>
                <p className="mt-1 text-[#7b6f70]">Cuenta {supplier.bankAccount || "sin cuenta"}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-brand-900">{formatClp(supplier.pending)}</p>
                <p className="mt-1 text-[#7b6f70]">{supplier.documents} facturas</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                  Ficha proveedor
                </p>
                <h2 className="mt-2 text-xl font-semibold text-brand-900">{selected.businessName}</h2>
                <p className="mt-1 text-sm text-[#6f6263]">Origen: {selected.source}</p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                {selected.risk}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["RUT", selected.rut],
                ["Banco", selected.bankName || selected.bankCode || "Sin banco"],
                ["Codigo banco", selected.bankCode || "Sin codigo"],
                ["Cuenta", selected.bankAccount || "Sin cuenta"],
                ["Email", selected.email || "Sin email"],
                ["Telefono", selected.phone || "Sin telefono"],
                ["Categoria", selected.category || "Sin categoria"],
                ["Condicion pago", selected.paymentTerms || "No informada"]
              ].map(([label, value]) => (
                <div className="rounded-xl border border-[#eadfd9] bg-[#fffdfb] p-3" key={label}>
                  <p className="text-xs text-[#7b6f70]">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-brand-900">{value}</p>
                </div>
              ))}
            </div>

            {selected.validation.alerts.length ? (
              <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="font-semibold text-amber-950">Alertas de ficha</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  {selected.validation.alerts.map((alert) => (
                    <li key={alert}>{alert}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#eadfd9] bg-white p-4 shadow-sm">
              <Building2 className="h-4 w-4 text-brand-700" />
              <p className="mt-2 text-xs text-[#7b6f70]">Deuda pendiente</p>
              <p className="mt-1 font-semibold text-brand-900">{formatClp(selected.pending)}</p>
            </div>
            <div className="rounded-xl border border-[#eadfd9] bg-white p-4 shadow-sm">
              <FileText className="h-4 w-4 text-brand-700" />
              <p className="mt-2 text-xs text-[#7b6f70]">Facturas</p>
              <p className="mt-1 font-semibold text-brand-900">{selected.documents}</p>
            </div>
            <div className="rounded-xl border border-[#eadfd9] bg-white p-4 shadow-sm">
              <CreditCard className="h-4 w-4 text-brand-700" />
              <p className="mt-2 text-xs text-[#7b6f70]">Vencido</p>
              <p className="mt-1 font-semibold text-brand-900">{formatClp(selected.overdueTotal)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-brand-900">Historial de facturas</h3>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {selected.invoices.length ? (
                selected.invoices.map((invoice) => (
                  <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm" key={invoice.normalizedKey}>
                    <div>
                      <p className="font-semibold text-brand-900">Folio {invoice.folio}</p>
                      <p className="text-xs text-[#7b6f70]">{invoice.fechaEmision}</p>
                    </div>
                    <p className="font-semibold text-brand-900">{formatClp(invoice.montoTotal)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6f6263]">Sin facturas XML asociadas todavia.</p>
              )}
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
