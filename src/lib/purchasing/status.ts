export const PURCHASE_REQUEST_STATUS_LABELS = {
  draft: "Borrador",
  submitted: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  converted: "Convertida",
  cancelled: "Cancelada"
} as const;

export const PURCHASE_ORDER_STATUS_LABELS = {
  draft: "Borrador",
  issued: "Emitida",
  partially_received: "Recepcion parcial",
  received: "Recepcionada",
  cancelled: "Cancelada",
  closed: "Cerrada"
} as const;

export const GOODS_RECEIPT_STATUS_LABELS = {
  draft: "Borrador",
  posted: "Contabilizada",
  cancelled: "Cancelada"
} as const;
