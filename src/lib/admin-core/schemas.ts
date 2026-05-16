import { z } from "zod";

const rutSchema = z
  .string()
  .trim()
  .min(8)
  .max(12)
  .regex(/^[0-9]+-[0-9kK]$/, "RUT must use Chilean format without dots.");

export const supplierSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  rut: rutSchema,
  legalName: z.string().trim().min(2).max(180),
  tradeName: z.string().trim().max(180).optional(),
  giro: z.string().trim().max(180).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  category: z.string().trim().max(80).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30)
});

export const supplierBankAccountSchema = z.object({
  tenantId: z.string().uuid(),
  supplierId: z.string().uuid(),
  bankName: z.string().trim().min(2).max(120),
  accountType: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim().min(4).max(80),
  accountHolderName: z.string().trim().min(2).max(180),
  accountHolderRut: rutSchema
});

export const productSchema = z.object({
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().trim().max(80).optional(),
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(500).optional(),
  unit: z.string().trim().min(1).max(40).default("unidad")
});

export const productPriceHistorySchema = z.object({
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  sourceEntityType: z.string().trim().min(2).max(80),
  sourceEntityId: z.string().uuid().nullable().optional(),
  price: z.coerce.number().min(0),
  currency: z.string().trim().length(3).default("CLP"),
  effectiveDate: z.string().date()
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type SupplierBankAccountInput = z.infer<typeof supplierBankAccountSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductPriceHistoryInput = z.infer<typeof productPriceHistorySchema>;
