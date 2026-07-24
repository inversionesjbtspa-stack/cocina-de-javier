export const HR_PAYSLIP_UPLOAD_POLICY = {
  allowedMimeTypes: ["application/pdf"],
  maxBatchBytes: 100 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 100,
  maxFilenameLength: 180
} as const;

export type PayslipUploadValidationError = {
  code: string;
  filename: string;
  message: string;
};

export function sanitizePayslipFilename(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, HR_PAYSLIP_UPLOAD_POLICY.maxFilenameLength);
  return sanitized || "liquidacion.pdf";
}

export function hasPdfExtension(filename: string) {
  return /\.pdf$/i.test(filename.trim());
}

export function hasPdfSignature(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function validatePayslipUploadFile(input: { buffer: Buffer; filename: string; mimeType: string; size: number }): PayslipUploadValidationError[] {
  const errors: PayslipUploadValidationError[] = [];
  const filename = input.filename || "sin_nombre";
  if (!input.size || input.buffer.length === 0) errors.push({ code: "empty_file", filename, message: "Archivo vacio." });
  if (input.size > HR_PAYSLIP_UPLOAD_POLICY.maxFileBytes) errors.push({ code: "file_too_large", filename, message: "El PDF supera el limite individual." });
  if (filename.length > HR_PAYSLIP_UPLOAD_POLICY.maxFilenameLength) errors.push({ code: "filename_too_long", filename, message: "Nombre de archivo demasiado largo." });
  if (!hasPdfExtension(filename)) errors.push({ code: "invalid_extension", filename, message: "La extension debe ser .pdf." });
  if (!HR_PAYSLIP_UPLOAD_POLICY.allowedMimeTypes.includes(input.mimeType as "application/pdf")) errors.push({ code: "invalid_mime", filename, message: "El tipo MIME debe ser application/pdf." });
  if (!hasPdfSignature(input.buffer)) errors.push({ code: "invalid_pdf_signature", filename, message: "El archivo no contiene firma PDF valida." });
  return errors;
}

export function validatePayslipUploadBatch(files: Array<{ size: number }>) {
  const errors: Array<{ code: string; message: string }> = [];
  if (files.length > HR_PAYSLIP_UPLOAD_POLICY.maxFiles) errors.push({ code: "too_many_files", message: "El lote supera la cantidad maxima de archivos." });
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > HR_PAYSLIP_UPLOAD_POLICY.maxBatchBytes) errors.push({ code: "batch_too_large", message: "El lote supera el tamano maximo acumulado." });
  return { errors, totalBytes };
}
