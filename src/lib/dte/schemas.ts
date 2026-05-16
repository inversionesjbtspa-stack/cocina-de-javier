import { z } from "zod";

const rutSchema = z
  .string()
  .trim()
  .regex(/^[0-9]+-[0-9kK]$/, "RUT must use Chilean format without dots.");

const moneySchema = z.coerce.number().min(0).max(9999999999);

export const dteDocumentSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  goodsReceiptId: z.string().uuid().nullable().optional(),
  tipoDte: z.string().trim().min(1).max(4),
  folio: z.string().trim().min(1).max(40),
  rutEmisor: rutSchema,
  rutReceptor: rutSchema,
  razonSocialEmisor: z.string().trim().max(180).optional(),
  razonSocialReceptor: z.string().trim().max(180).optional(),
  fechaEmision: z.string().date(),
  montoNeto: moneySchema.default(0),
  montoExento: moneySchema.default(0),
  iva: moneySchema.default(0),
  montoTotal: moneySchema,
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("CLP"),
  xmlSha256: z.string().trim().min(32).max(128),
  idempotencyKey: z.string().trim().min(12).max(180)
});

export const dteItemSchema = z.object({
  lineNumber: z.coerce.number().int().positive(),
  productId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(40).default("unidad"),
  unitPrice: moneySchema.default(0),
  discountAmount: moneySchema.default(0),
  lineTotal: moneySchema.default(0)
});

export const dteValidationResultSchema = z.object({
  tenantId: z.string().uuid(),
  dteDocumentId: z.string().uuid(),
  validatorCode: z.string().trim().min(2).max(80),
  status: z.enum(["pending", "passed", "failed", "warning"]),
  message: z.string().trim().max(1000).optional(),
  details: z.record(z.unknown()).optional()
});

export type DteDocumentInput = z.infer<typeof dteDocumentSchema>;
export type DteItemInput = z.infer<typeof dteItemSchema>;
export type DteValidationResultInput = z.infer<typeof dteValidationResultSchema>;
