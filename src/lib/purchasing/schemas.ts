import { z } from "zod";

const moneySchema = z.coerce.number().min(0).max(9999999999);
const quantitySchema = z.coerce.number().positive().max(999999999);
const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/).default("CLP");

export const purchaseRequestItemSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(2).max(240),
  quantity: quantitySchema,
  unit: z.string().trim().min(1).max(40).default("unidad"),
  estimatedUnitPrice: moneySchema.default(0),
  notes: z.string().trim().max(500).optional()
});

export const purchaseRequestSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  requestNumber: z.string().trim().min(2).max(60),
  requiredDate: z.string().date().nullable().optional(),
  justification: z.string().trim().max(1000).optional(),
  currency: currencySchema,
  items: z.array(purchaseRequestItemSchema).min(1)
});

export const purchaseApprovalSchema = z.object({
  tenantId: z.string().uuid(),
  purchaseRequestId: z.string().uuid(),
  approverUserId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  comments: z.string().trim().max(1000).optional()
});

export const purchaseOrderItemSchema = z.object({
  purchaseRequestItemId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(2).max(240),
  quantity: quantitySchema,
  unit: z.string().trim().min(1).max(40).default("unidad"),
  unitPrice: moneySchema,
  notes: z.string().trim().max(500).optional()
});

export const purchaseOrderSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid(),
  purchaseRequestId: z.string().uuid().nullable().optional(),
  orderNumber: z.string().trim().min(2).max(60),
  issueDate: z.string().date(),
  expectedDeliveryDate: z.string().date().nullable().optional(),
  currency: currencySchema,
  notes: z.string().trim().max(1000).optional(),
  items: z.array(purchaseOrderItemSchema).min(1)
});

export const goodsReceiptItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(2).max(240),
  receivedQuantity: quantitySchema,
  rejectedQuantity: z.coerce.number().min(0).max(999999999).default(0),
  unit: z.string().trim().min(1).max(40).default("unidad"),
  conditionNotes: z.string().trim().max(500).optional()
});

export const goodsReceiptSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid(),
  receiptNumber: z.string().trim().min(2).max(60),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(goodsReceiptItemSchema).min(1)
});

export function sumPurchaseRequestItems(
  items: Array<z.infer<typeof purchaseRequestItemSchema>>
) {
  return items.reduce(
    (total, item) => total + item.quantity * item.estimatedUnitPrice,
    0
  );
}

export function sumPurchaseOrderItems(
  items: Array<z.infer<typeof purchaseOrderItemSchema>>
) {
  return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;
export type PurchaseApprovalInput = z.infer<typeof purchaseApprovalSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;
