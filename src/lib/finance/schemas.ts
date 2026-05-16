import { z } from "zod";

const moneySchema = z.coerce.number().min(0).max(9999999999);
const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/).default("CLP");

export const accountsPayableSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  supplierId: z.string().uuid(),
  dteDocumentId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  documentNumber: z.string().trim().min(1).max(80),
  issueDate: z.string().date(),
  dueDate: z.string().date(),
  subtotal: moneySchema.default(0),
  taxAmount: moneySchema.default(0),
  totalAmount: moneySchema,
  balanceAmount: moneySchema,
  currency: currencySchema
});

export const paymentBatchSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  batchNumber: z.string().trim().min(2).max(80),
  bankName: z.string().trim().min(2).max(120).default("Banco Santander Chile"),
  currency: currencySchema,
  items: z
    .array(
      z.object({
        accountsPayableId: z.string().uuid(),
        supplierBankAccountId: z.string().uuid().nullable().optional(),
        amount: z.coerce.number().positive(),
        currency: currencySchema
      })
    )
    .min(1)
});

export const budgetSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  lines: z
    .array(
      z.object({
        costCenterId: z.string().uuid().nullable().optional(),
        productCategoryId: z.string().uuid().nullable().optional(),
        amount: moneySchema,
        currency: currencySchema,
        notes: z.string().trim().max(500).optional()
      })
    )
    .min(1)
});

export type AccountsPayableInput = z.infer<typeof accountsPayableSchema>;
export type PaymentBatchInput = z.infer<typeof paymentBatchSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
