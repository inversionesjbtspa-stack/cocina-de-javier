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
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
  xmlSha256: string;
  sourceMessageId: string;
  sourceAttachmentId: string;
  sourceFilename: string;
  raw: {
    trackId: string | null;
    ted: unknown;
    caf: unknown;
    references: ExtractedDteReference[];
  };
  items: ExtractedDteItem[];
};

export type ExtractedDteItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

export type ExtractedDteReference = {
  referencedTipoDte: string | null;
  referencedFolio: string | null;
  referenceDate: string | null;
  reason: string | null;
};
