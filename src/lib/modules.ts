export type ErpModule = {
  slug: string;
  name: string;
  description: string;
  stage: "Base" | "Finanzas" | "Operacion" | "Control";
};

export const MODULES: ErpModule[] = [
  {
    slug: "empresas",
    name: "Empresas y sucursales",
    description: "Tenants, razones sociales, sucursales y contexto operativo.",
    stage: "Base"
  },
  {
    slug: "dashboard-ejecutivo",
    name: "Dashboard ejecutivo",
    description: "KPIs financieros, compras, cuentas por pagar y tendencias.",
    stage: "Finanzas"
  },
  {
    slug: "facturas-dte",
    name: "Facturas XML DTE",
    description: "Carga, validacion, trazabilidad y storage privado de XML.",
    stage: "Operacion"
  },
  {
    slug: "pdf-desde-xml",
    name: "PDF desde XML",
    description: "Representacion PDF versionada desde documentos tributarios.",
    stage: "Operacion"
  },
  {
    slug: "proveedores",
    name: "Proveedores",
    description: "Maestro, contactos, cuentas bancarias y documentos.",
    stage: "Base"
  },
  {
    slug: "compras",
    name: "Compras",
    description: "Solicitudes, ordenes de compra, recepciones y matching.",
    stage: "Operacion"
  },
  {
    slug: "productos",
    name: "Productos",
    description: "Catalogo, categorias, proveedores y precios historicos.",
    stage: "Base"
  },
  {
    slug: "cuentas-por-pagar",
    name: "Cuentas por pagar",
    description: "Aging, aprobaciones, estados de pago y vencimientos.",
    stage: "Finanzas"
  },
  {
    slug: "pagos-santander",
    name: "Pagos Santander",
    description: "Lotes, doble aprobacion, archivos bancarios e idempotencia.",
    stage: "Finanzas"
  },
  {
    slug: "auditoria",
    name: "Auditoria y logs",
    description: "Eventos append-only para acciones sensibles y cambios.",
    stage: "Control"
  }
];
