import {
  formatClp,
  purchasesData,
  type DtePurchaseInvoice
} from "@/lib/dte/purchases-data";
import {
  categorySpend,
  currentMonthInvoices,
  overdueInvoices,
  pendingPayables,
  priceIncreaseProducts,
  supplierSpend,
  totalAmount
} from "@/lib/finance/erp-metrics";

export function supplierProfiles(limit = 12) {
  const rows = new Map<
    string,
    {
      rut: string;
      name: string;
      invoices: DtePurchaseInvoice[];
      total: number;
      pending: number;
      overdue: number;
      products: Set<string>;
    }
  >();

  const overdueKeys = new Set(overdueInvoices().map((invoice) => invoice.normalizedKey));

  for (const invoice of purchasesData.invoices) {
    const row = rows.get(invoice.rutEmisor) ?? {
      rut: invoice.rutEmisor,
      name: invoice.razonSocialEmisor,
      invoices: [],
      overdue: 0,
      pending: 0,
      products: new Set<string>(),
      total: 0
    };

    row.invoices.push(invoice);
    row.total += invoice.tipoDte === "61" ? -invoice.montoTotal : invoice.montoTotal;
    row.pending += invoice.paymentStatus === "Pagada" ? 0 : invoice.montoTotal;
    row.overdue += overdueKeys.has(invoice.normalizedKey) ? invoice.montoTotal : 0;
    invoice.items.forEach((item) => row.products.add(item.description));
    rows.set(invoice.rutEmisor, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      documents: row.invoices.length,
      productsCount: row.products.size,
      score: row.overdue > 0 ? 62 : row.pending > 2_000_000 ? 76 : 91,
      risk: (row.overdue > 0
        ? "critical"
        : row.pending > 2_000_000
          ? "warning"
          : "success") as "critical" | "warning" | "success",
      totalClp: formatClp(row.total),
      pendingClp: formatClp(row.pending),
      overdueClp: formatClp(row.overdue),
      avgMonthlyClp: formatClp(row.total / Math.max(1, purchasesData.summaries.byMonth.length))
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function productAnalytics(limit = 14) {
  const increases = priceIncreaseProducts(100);

  return purchasesData.summaries.products
    .map((product) => {
      const increase = increases.find((item) => item.description === product.description);
      const last = product.lastPrices[0];
      const best = product.lastPrices.reduce(
        (min, price) => (price.unitPrice < min.unitPrice ? price : min),
        product.lastPrices[0]
      );

      return {
        ...product,
        best,
        last,
        risk: (
          increase?.severity === "critical"
            ? "critical"
            : increase?.severity === "warning"
              ? "warning"
              : "success"
        ) as "critical" | "warning" | "success",
        variation: increase?.variation ?? 0,
        lastPriceClp: formatClp(last?.unitPrice ?? 0),
        bestPriceClp: formatClp(best?.unitPrice ?? 0)
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function cashflowDays() {
  const rows = new Map<string, { date: string; invoices: number; total: number }>();
  for (const invoice of pendingPayables) {
    const row = rows.get(invoice.fechaVencimiento) ?? {
      date: invoice.fechaVencimiento,
      invoices: 0,
      total: 0
    };
    row.invoices += 1;
    row.total += invoice.montoTotal;
    rows.set(invoice.fechaVencimiento, row);
  }

  return [...rows.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 18)
    .map((row) => ({ ...row, totalClp: formatClp(row.total) }));
}

export function executiveSnapshot() {
  const categories = categorySpend();
  const suppliers = supplierSpend(10);
  const products = productAnalytics(10);

  return {
    monthInvoices: currentMonthInvoices.length,
    pendingAmount: totalAmount(pendingPayables),
    overdueAmount: totalAmount(overdueInvoices()),
    topCategory: categories[0],
    topSupplier: suppliers[0],
    topProduct: products[0],
    supplierCount: supplierProfiles(1000).length,
    productCount: purchasesData.summaries.products.length
  };
}
