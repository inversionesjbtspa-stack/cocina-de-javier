import {
  type DtePurchaseData,
  type DtePurchaseInvoice,
  formatClp,
  purchasesData,
  totalsFor
} from "@/lib/dte/purchases-data";

export type Severity = "healthy" | "warning" | "critical";

const categoryRules = [
  {
    category: "Bebidas y licores",
    pattern: /bebida|coca|sprite|gin|pisco|whisky|vino|ron|cerveza|agua|jugo|aperol|ramaz|bitte/i
  },
  {
    category: "Carnes y cecinas",
    pattern: /carne|pernil|pollo|vacuno|cerdo|cecinas|jamon|lomo|costillar/i
  },
  {
    category: "Huevos y lacteos",
    pattern: /huevo|yema|leche|queso|crema|mantequilla|yogur/i
  },
  {
    category: "Abarrotes",
    pattern: /harina|azucar|aceite|arroz|sal|pasta|salsa|conserva|legumbre/i
  },
  {
    category: "Servicios y plataformas",
    pattern: /rappi|servicio|software|comision|arriendo|mantencion/i
  }
];

export function statusTone(severity: Severity) {
  if (severity === "critical") {
    return {
      badge: "border-red-200 bg-red-50 text-red-700",
      dot: "bg-red-500",
      panel: "border-red-200 bg-red-50/70",
      text: "text-red-700"
    };
  }

  if (severity === "warning") {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
      panel: "border-amber-200 bg-amber-50/70",
      text: "text-amber-700"
    };
  }

  return {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    panel: "border-emerald-200 bg-emerald-50/70",
    text: "text-emerald-700"
  };
}

export function severityLabel(severity: Severity) {
  return severity === "critical"
    ? "Critico"
    : severity === "warning"
      ? "Atencion"
      : "Saludable";
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiff(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`).getTime();
  const to = new Date(`${toDate}T00:00:00`).getTime();
  return Math.ceil((to - from) / 86_400_000);
}

export function createErpMetrics(data: DtePurchaseData = purchasesData) {
  const operatingDate = addDays(data.invoices[0]?.fechaEmision ?? "2026-05-16", 1);
  const currentMonth = data.summaries.byMonth[0]?.key ?? "2026-05";
  const currentMonthInvoices = data.invoices.filter((invoice) =>
    invoice.fechaEmision.startsWith(currentMonth)
  );
  const payableInvoices = data.invoices.filter((invoice) => invoice.tipoDte !== "61");
  const pendingPayables = payableInvoices.filter(
    (invoice) => invoice.paymentStatus !== "Pagada"
  );

  function invoicesDueWithin(days: number) {
  return pendingPayables.filter((invoice) => {
    const diff = dayDiff(operatingDate, invoice.fechaVencimiento);
    return diff >= 0 && diff <= days;
  });
  }

  function overdueInvoices() {
  return pendingPayables.filter(
    (invoice) => dayDiff(operatingDate, invoice.fechaVencimiento) < 0
  );
  }

  function totalAmount(invoices: DtePurchaseInvoice[]) {
  return invoices.reduce((sum, invoice) => sum + invoice.montoTotal, 0);
  }

  function projectedCashFlow() {
  const due30 = totalAmount(invoicesDueWithin(30));
  const overdue = totalAmount(overdueInvoices());
  return -(due30 + overdue);
  }

  function previousMonthAverage() {
  const previousMonths = data.summaries.byMonth.slice(1);
  if (!previousMonths.length) {
    return 0;
  }
  return (
    previousMonths.reduce((sum, month) => sum + month.total, 0) /
    previousMonths.length
  );
  }

  function monthlyCostVariation() {
  const previous = data.summaries.byMonth[1]?.total ?? 0;
  const current = data.summaries.byMonth[0]?.total ?? 0;
  if (!previous) {
    return 0;
  }
  return ((current - previous) / previous) * 100;
  }

  function budgetStatus() {
  const budget = previousMonthAverage() * 1.08;
  const spent = totalsFor(currentMonthInvoices).total;
  const usage = budget > 0 ? (spent / budget) * 100 : 0;
  const severity: Severity =
    usage >= 105 ? "critical" : usage >= 90 ? "warning" : "healthy";

  return {
    budget,
    spent,
    usage,
    severity
  };
  }

  function riskStatus() {
  const overdue = overdueInvoices();
  const due7 = invoicesDueWithin(7);
  const cashFlow = projectedCashFlow();

  if (overdue.length > 0 || Math.abs(cashFlow) > 10_000_000) {
    return "critical" as const;
  }
  if (due7.length > 5 || Math.abs(cashFlow) > 5_000_000) {
    return "warning" as const;
  }
  return "healthy" as const;
  }

  function categorySpend() {
  const rows = new Map<string, number>();

  for (const invoice of currentMonthInvoices) {
    if (invoice.tipoDte === "61") {
      continue;
    }

    for (const item of invoice.items) {
      const category =
        categoryRules.find((rule) => rule.pattern.test(item.description))
          ?.category ?? "Otros insumos";
      rows.set(category, (rows.get(category) ?? 0) + item.lineTotal);
    }
  }

  return [...rows.entries()]
    .map(([category, total]) => ({ category, total, totalClp: formatClp(total) }))
    .sort((a, b) => b.total - a.total);
  }

  function supplierSpend(limit = 8) {
  const rows = new Map<string, { supplier: string; total: number; documents: number }>();

  for (const invoice of currentMonthInvoices) {
    if (invoice.tipoDte === "61") {
      continue;
    }

    const current = rows.get(invoice.rutEmisor) ?? {
      documents: 0,
      supplier: invoice.razonSocialEmisor,
      total: 0
    };
    current.documents += 1;
    current.total += invoice.montoTotal;
    rows.set(invoice.rutEmisor, current);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, totalClp: formatClp(row.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  }

  function priceIncreaseProducts(limit = 8) {
  return data.summaries.products
    .map((product) => {
      const latest = product.lastPrices[0];
      const oldest = product.lastPrices[product.lastPrices.length - 1];
      const variation =
        latest && oldest && oldest.unitPrice > 0
          ? ((latest.unitPrice - oldest.unitPrice) / oldest.unitPrice) * 100
          : 0;

      return {
        ...product,
        latest,
        oldest,
        severity:
          variation >= 20 ? ("critical" as const) : variation >= 8 ? ("warning" as const) : ("healthy" as const),
        variation
      };
    })
    .filter((product) => product.variation > 0)
    .sort((a, b) => b.variation - a.variation)
    .slice(0, limit);
  }

  function duplicateRiskInvoices() {
  const seen = new Map<string, number>();
  for (const invoice of data.invoices) {
    const key = `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).length;
  }

  function executiveAlerts() {
  const overdue = overdueInvoices();
  const due7 = invoicesDueWithin(7);
  const priceRisks = priceIncreaseProducts(5).filter(
    (product) => product.severity !== "healthy"
  );
  const budget = budgetStatus();
  const duplicates = duplicateRiskInvoices();

  return [
    {
      detail: overdue.length
        ? `${overdue.length} documentos vencidos por ${formatClp(totalAmount(overdue))}`
        : "Sin facturas vencidas en el corte operativo",
      label: "Facturas vencidas",
      severity: overdue.length ? ("critical" as const) : ("healthy" as const)
    },
    {
      detail: `${due7.length} pagos vencen en 7 dias por ${formatClp(totalAmount(due7))}`,
      label: "Pagos proximos",
      severity: due7.length > 5 ? ("warning" as const) : ("healthy" as const)
    },
    {
      detail: `${priceRisks.length} productos con alza sobre umbral`,
      label: "Alzas de precios",
      severity: priceRisks.some((product) => product.severity === "critical")
        ? ("critical" as const)
        : priceRisks.length
          ? ("warning" as const)
          : ("healthy" as const)
    },
    {
      detail: `${budget.usage.toFixed(1)}% del presupuesto operativo estimado`,
      label: "Presupuesto vs gasto",
      severity: budget.severity
    },
    {
      detail: duplicates
        ? `${duplicates} posibles duplicados por RUT/tipo/folio`
        : "Sin duplicados detectados por RUT/tipo/folio",
      label: "Control de duplicados",
      severity: duplicates ? ("critical" as const) : ("healthy" as const)
    }
  ];
  }

  return {
    budgetStatus,
    categorySpend,
    currentMonth,
    currentMonthInvoices,
    duplicateRiskInvoices,
    executiveAlerts,
    invoicesDueWithin,
    monthlyCostVariation,
    operatingDate,
    overdueInvoices,
    payableInvoices,
    pendingPayables,
    priceIncreaseProducts,
    projectedCashFlow,
    riskStatus,
    supplierSpend,
    totalAmount
  };
}

export const {
  budgetStatus,
  categorySpend,
  currentMonth,
  currentMonthInvoices,
  duplicateRiskInvoices,
  executiveAlerts,
  invoicesDueWithin,
  monthlyCostVariation,
  operatingDate,
  overdueInvoices,
  payableInvoices,
  pendingPayables,
  priceIncreaseProducts,
  projectedCashFlow,
  riskStatus,
  supplierSpend,
  totalAmount
} = createErpMetrics(purchasesData);
