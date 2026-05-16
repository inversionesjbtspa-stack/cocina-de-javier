export type ExtractedDteInvoice = {
  idempotencyKey: string;
  tipoDte: string;
  folio: string;
  rutEmisor: string;
  razonSocialEmisor: string | null;
  rutReceptor: string;
  razonSocialReceptor: string | null;
  fechaEmision: string;
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
  xmlSha256: string;
  sourceMessageId: string;
  sourceAttachmentId: string;
  sourceFilename: string;
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
