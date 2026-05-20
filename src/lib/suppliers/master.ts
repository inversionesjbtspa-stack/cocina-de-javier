import master from "@/data/suppliers-master.json";
import { purchasesData, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";
import { overdueInvoices } from "@/lib/finance/erp-metrics";

export type MasterSupplier = (typeof master.suppliers)[number];

export type SupplierValidation = {
  ok: boolean;
  alerts: string[];
};

export function normalizeRut(value: string) {
  return value.toUpperCase().replace(/[^0-9K]/g, "");
}

export function supplierByRut(rut: string) {
  const normalized = normalizeRut(rut);
  return master.suppliers.find((supplier) => normalizeRut(supplier.rut) === normalized) ?? null;
}

export function supplierValidation(supplier: MasterSupplier | null): SupplierValidation {
  const alerts: string[] = [];

  if (!supplier) {
    alerts.push("Proveedor no existe en master");
  } else {
    if (!supplier.rut) alerts.push("Proveedor sin RUT");
    if (!supplier.bankCode) alerts.push("Proveedor sin codigo de banco");
    if (!supplier.bankAccount) alerts.push("Proveedor sin cuenta bancaria");
    if (!supplier.email) alerts.push("Proveedor sin email");
  }

  return {
    alerts,
    ok: alerts.length === 0
  };
}

export function supplierInvoices(rut: string) {
  const normalized = normalizeRut(rut);
  return purchasesData.invoices.filter((invoice) => normalizeRut(invoice.rutEmisor) === normalized);
}

export function enrichedSuppliers() {
  const overdue = new Set(overdueInvoices().map((invoice) => invoice.normalizedKey));

  return master.suppliers.map((supplier) => {
    const invoices = supplierInvoices(supplier.rut);
    const total = invoices.reduce(
      (sum, invoice) => sum + (invoice.tipoDte === "61" ? -invoice.montoTotal : invoice.montoTotal),
      0
    );
    const pending = invoices.reduce(
      (sum, invoice) => sum + (invoice.paymentStatus === "Pagada" ? 0 : invoice.montoTotal),
      0
    );
    const overdueTotal = invoices.reduce(
      (sum, invoice) => sum + (overdue.has(invoice.normalizedKey) ? invoice.montoTotal : 0),
      0
    );
    const products = new Set(invoices.flatMap((invoice) => invoice.items.map((item) => item.description)));
    const validation = supplierValidation(supplier);

    return {
      ...supplier,
      documents: invoices.length,
      invoices,
      overdueTotal,
      pending,
      products: [...products],
      risk:
        overdueTotal > 0 || !validation.ok
          ? "critical"
          : pending > 2_000_000
            ? "warning"
            : "success",
      total,
      validation
    };
  });
}

export function paymentValidation(invoice: DtePurchaseInvoice) {
  const supplier = supplierByRut(invoice.rutEmisor);
  const validation = supplierValidation(supplier);
  const alerts = [...validation.alerts];

  if (invoice.montoTotal <= 0) alerts.push("Monto debe ser mayor a cero");
  if (invoice.paymentStatus === "Pagada") alerts.push("Factura ya pagada");
  if (invoice.tipoDte === "61") alerts.push("Nota de credito no genera pago");

  return {
    alerts,
    invoice,
    ok: alerts.length === 0,
    supplier
  };
}

export const suppliersMaster = master;
