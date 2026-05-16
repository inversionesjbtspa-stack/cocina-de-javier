type StorageEntity = "dte" | "supplier" | "purchase" | "payment" | "report";

export function buildTenantStoragePath({
  tenantId,
  entity,
  entityId,
  fileName
}: {
  tenantId: string;
  entity: StorageEntity;
  entityId: string;
  fileName: string;
}) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  return `${tenantId}/${entity}/${entityId}/${safeFileName}`;
}
