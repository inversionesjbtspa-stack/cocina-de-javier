export type BankMappingResult = {
  bankCode: string;
  bankNameNormalized: string;
  bankRawClean: string;
  confidence: number;
  needsReview: boolean;
  source: string;
};

type BankMapping = Omit<BankMappingResult, "bankRawClean"> & { aliases: string[] };

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function cleanBankName(value: string | null | undefined) {
  return removeAccents(value ?? "")
    .toUpperCase()
    .replace(/\[OBJECT OBJECT\]/g, " ")
    .replace(/OBJECT OBJECT/g, " ")
    .replace(/\/\//g, " ")
    .replace(/[().]/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

const masterSource = "master proveedores jesus";
const mappings: BankMapping[] = [
  { aliases: ["BANCO DE CREDITO E INVERSIONES - NOVA BCI", "BANCO DE CREDITO E INVERSIONES", "BCI", "NOVA BCI"], bankCode: "16", bankNameNormalized: "BCI", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO DE A EDWARDS", "BANCO EDWARDS", "BANCO DE CHILE"], bankCode: "1", bankNameNormalized: "BANCO DE CHILE / EDWARDS", confidence: 0.98, needsReview: false, source: masterSource },
  { aliases: ["BANCO SANTANDER CHILE", "BANCO SANTANDER", "SANTANDER"], bankCode: "37", bankNameNormalized: "BANCO SANTANDER CHILE", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["THE FIRST NAT BANK OF BOSTON ITAU", "THE FIRST NAT BANK OF BOSTON", "ITAU"], bankCode: "39", bankNameNormalized: "ITAU", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO DEL ESTADO DE CHILE", "BANCO ESTADO", "BANCO DEL ESTADO"], bankCode: "12", bankNameNormalized: "BANCO ESTADO", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["SCOTIABANK", "BANCO SCOTIABANK SUDAMERICANO"], bankCode: "14", bankNameNormalized: "SCOTIABANK", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO SECURITY"], bankCode: "49", bankNameNormalized: "BANCO SECURITY", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO BICE"], bankCode: "28", bankNameNormalized: "BANCO BICE", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO FALABELLA"], bankCode: "51", bankNameNormalized: "BANCO FALABELLA", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO RIPLEY"], bankCode: "53", bankNameNormalized: "BANCO RIPLEY", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO INTERNACIONAL"], bankCode: "9", bankNameNormalized: "BANCO INTERNACIONAL", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO BBVA SCOTIA BANK AZUL"], bankCode: "504", bankNameNormalized: "BBVA / SCOTIA BANK AZUL", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["CORPBANCA"], bankCode: "27", bankNameNormalized: "CORPBANCA", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["MERCADOPAGO", "MERCADO PAGO"], bankCode: "875", bankNameNormalized: "MERCADO PAGO", confidence: 1, needsReview: false, source: masterSource },
  { aliases: ["BANCO CONSORCIO"], bankCode: "", bankNameNormalized: "BANCO CONSORCIO", confidence: 0.5, needsReview: true, source: "needs master/template confirmation" },
  { aliases: ["COOPEUCH"], bankCode: "", bankNameNormalized: "COOPEUCH", confidence: 0.5, needsReview: true, source: "needs master/template confirmation" },
  { aliases: ["TENPO"], bankCode: "", bankNameNormalized: "TENPO", confidence: 0.5, needsReview: true, source: "needs master/template confirmation" }
];

export function mapBankName(value: string | null | undefined): BankMappingResult {
  const bankRawClean = cleanBankName(value);
  const mapping = mappings.find((candidate) => candidate.aliases.some((alias) => bankRawClean === alias || bankRawClean.includes(alias)));
  if (!mapping) {
    return { bankCode: "", bankNameNormalized: bankRawClean || "SIN BANCO", bankRawClean, confidence: 0, needsReview: true, source: "unmapped" };
  }
  return {
    bankCode: mapping.bankCode,
    bankNameNormalized: mapping.bankNameNormalized,
    bankRawClean,
    confidence: mapping.confidence,
    needsReview: mapping.needsReview,
    source: mapping.source
  };
}

export function mappedBanks() {
  return mappings.filter((mapping) => mapping.bankCode).map((mapping) => ({ aliases: mapping.aliases, bankCode: mapping.bankCode, bankNameNormalized: mapping.bankNameNormalized }));
}
