export type ExtractedDteInvoice = {
  idempotencyKey: string;
  tipoDte: string;
  folio: string;
  rutEmisor: string;
  razonSocialEmisor: string | null;
  rutReceptor: string;
  razonSocialReceptor: string | null;
  fechaEmision: string;
  fechaVencimiento: string | null;
  formaPago: string | null;
  termPagoGlosa: string | null;
  montoBruto: number | null;
  tipoTranCompra: string | null;
  tipoTranVenta: string | null;
  giroEmisor: string | null;
  acteco: string | null;
  dirOrigen: string | null;
  cmnaOrigen: string | null;
  ciudadOrigen: string | null;
  cdgSiiSucur: string | null;
  giroReceptor: string | null;
  dirReceptor: string | null;
  cmnaReceptor: string | null;
  ciudadReceptor: string | null;
  montoNeto: number;
  montoExento: number;
  tasaIva: number | null;
  iva: number;
  ivaUsoComun: number | null;
  montoTotal: number;
  montoPeriodo: number | null;
  valorPagar: number | null;
  xmlSha256: string;
  sourceMessageId: string;
  sourceThreadId: string | null;
  sourceAttachmentId: string;
  sourceFilename: string;
  sourceReceivedAt: string | null;
  sourceSender: string | null;
  sourceSubject: string | null;
  raw: {
    trackId: string | null;
    ted: unknown;
    caf: unknown;
    frmt: string | null;
    emitter: unknown;
    receiver: unknown;
    parsedJson: unknown;
    references: ExtractedDteReference[];
    globalDiscounts: ExtractedDteGlobalDiscount[];
    taxes: ExtractedDteTax[];
    parserWarnings: string[];
    parserErrors: string[];
    validation: ExtractedDteValidation;
  };
  items: ExtractedDteItem[];
};

export type ExtractedDteItem = {
  lineNumber: number;
  itemCode: string | null;
  codeType: string | null;
  codeValue: string | null;
  name: string;
  rawName: string | null;
  normalizedName: string;
  description: string;
  rawDescription: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number | null;
  discountAmount: number;
  surchargePct: number | null;
  surchargeAmount: number;
  additionalTaxCode: string | null;
  lineTotal: number;
  validationStatus: "valid" | "warning" | "error";
  validationErrors: string[];
  priceConfidenceScore: number;
  productEligible: boolean;
  raw: unknown;
};

export type ExtractedDteReference = {
  lineNumber: number | null;
  referencedTipoDte: string | null;
  referencedFolio: string | null;
  referenceDate: string | null;
  referenceCode: string | null;
  reason: string | null;
  raw: unknown;
};

export type ExtractedDteTax = {
  lineNumber: number | null;
  tipoImp: string | null;
  tasaImp: number | null;
  montoImp: number;
  raw: unknown;
};

export type ExtractedDteGlobalDiscount = {
  lineNumber: number | null;
  movementType: string | null;
  description: string | null;
  valueType: string | null;
  value: number | null;
  otherCurrencyValue: number | null;
  exemptIndicator: string | null;
  raw: unknown;
};

export type ExtractedDteValidation = {
  status: "valid" | "warning" | "error";
  warnings: string[];
  errors: string[];
  confidenceScore: number;
};
