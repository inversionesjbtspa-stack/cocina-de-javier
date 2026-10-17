export type VacationReceiptMetadataClient = {
  rpc: (name: "hr_upsert_vacation_receipt_metadata", args: { p_metadata: Record<string, unknown> }) => PromiseLike<{
    data?: unknown;
    error?: { message: string } | null;
  }>;
};

export function upsertVacationReceiptMetadata(client: VacationReceiptMetadataClient, metadata: Record<string, unknown>) {
  // PostgREST upsert cannot specify the predicate of the receipt-only unique index.
  return client.rpc("hr_upsert_vacation_receipt_metadata", { p_metadata: metadata });
}
