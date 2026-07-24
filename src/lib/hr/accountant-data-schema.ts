import { z } from "zod";

export const hrAccountantRowSchema = z.object({
  absences: z.coerce.number().min(0).optional().default(0),
  advances: z.coerce.number().min(0).optional().default(0),
  aguinaldo: z.coerce.number().min(0).optional().default(0),
  cashAllowance: z.coerce.number().min(0).optional().default(0),
  ccafLoan: z.coerce.number().min(0).optional().default(0),
  compensatoryBonus: z.coerce.number().min(0).optional().default(0),
  companyLoan: z.coerce.number().min(0).optional().default(0),
  costCenter: z.string().trim().max(160).optional().default(""),
  discounts: z.coerce.number().min(0).optional().default(0),
  fullName: z.string().trim().min(2).max(240),
  licenses: z.coerce.number().min(0).optional().default(0),
  movilization: z.coerce.number().min(0).optional().default(0),
  observations: z.string().trim().max(1000).optional().default(""),
  overtimeHours: z.coerce.number().min(0).optional().default(0),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  phoneAllowance: z.coerce.number().min(0).optional().default(0),
  productionBonus: z.coerce.number().min(0).optional().default(0),
  reason: z.string().trim().max(500).optional().default(""),
  responsibilityBonus: z.coerce.number().min(0).optional().default(0),
  rowNumber: z.coerce.number().int().min(1).optional().default(0),
  rut: z.string().trim().min(7).max(14),
  sheetName: z.string().trim().max(160).optional().default("LIBRO REMUNERACIONES"),
  sundaySurcharge: z.coerce.number().min(0).optional().default(0)
});

export type HrAccountantRowInput = z.infer<typeof hrAccountantRowSchema>;
