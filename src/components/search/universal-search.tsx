"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { purchasesData } from "@/lib/dte/purchases-data";

type SearchResult = {
  href: string;
  label: string;
  detail: string;
  type: "Factura" | "Proveedor" | "Producto";
};

const supplierResults = purchasesData.summaries.suppliers.map<SearchResult>((supplier) => ({
  detail: `${supplier.rut} · ${supplier.documents} documentos`,
  href: `/proveedores?q=${encodeURIComponent(supplier.razonSocial)}`,
  label: supplier.razonSocial,
  type: "Proveedor"
}));

const invoiceResults = purchasesData.invoices.map<SearchResult>((invoice) => ({
  detail: `Folio ${invoice.folio} · ${invoice.rutEmisor} · ${invoice.montoTotal.toLocaleString("es-CL")}`,
  href: `/facturas?folio=${encodeURIComponent(invoice.folio)}`,
  label: invoice.razonSocialEmisor,
  type: "Factura"
}));

const productResults = purchasesData.summaries.products.map<SearchResult>((product) => ({
  detail: `${product.documents} compras · ${product.quantity.toLocaleString("es-CL")} unidades`,
  href: `/productos?q=${encodeURIComponent(product.description)}`,
  label: product.description,
  type: "Producto"
}));

const results = [...invoiceResults, ...supplierResults, ...productResults];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function highlight(label: string, query: string) {
  if (!query.trim()) {
    return label;
  }
  const index = normalize(label).indexOf(normalize(query));
  if (index < 0) {
    return label;
  }
  return (
    <>
      {label.slice(0, index)}
      <mark className="rounded bg-gold-100 px-0.5 text-brand-900">{label.slice(index, index + query.length)}</mark>
      {label.slice(index + query.length)}
    </>
  );
}

export function UniversalSearch() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const visibleResults = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (normalizedQuery.length < 2) {
      return [];
    }
    return results
      .filter((result) => normalize(`${result.label} ${result.detail} ${result.type}`).includes(normalizedQuery))
      .slice(0, 8);
  }, [query]);

  return (
    <div className="relative w-full md:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b8a85]" />
      <input
        className="w-full rounded-xl border border-[#eadfd9] bg-white px-9 py-2.5 text-sm text-brand-900 outline-none transition placeholder:text-[#a59591] focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
        onBlur={() => window.setTimeout(() => setFocused(false), 140)}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="Buscar proveedor, RUT, producto, folio o monto"
        type="search"
        value={query}
      />
      {focused && query.length >= 2 ? (
        <div className="absolute right-0 top-12 z-30 w-full overflow-hidden rounded-2xl border border-[#eadfd9] bg-white shadow-[0_20px_48px_rgba(43,16,24,0.14)]">
          {visibleResults.length ? (
            <div className="max-h-96 overflow-y-auto p-2">
              {visibleResults.map((result) => (
                <a
                  className="block rounded-xl px-3 py-2.5 transition hover:bg-brand-50"
                  href={result.href}
                  key={`${result.type}-${result.label}-${result.detail}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-brand-900">
                      {highlight(result.label, query)}
                    </p>
                    <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                      {result.type}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#6f6263]">{result.detail}</p>
                </a>
              ))}
            </div>
          ) : (
            <div className="p-5 text-sm text-[#6f6263]">
              No hay resultados para esa busqueda.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
