import { mapBankName } from "../payments/bank-mappings";
import { normalizeRut } from "./utils";

export type HrBankImportRow = {
  accountNumber: string;
  amount: number;
  bankCode: string;
  bankName: string;
  email: string;
  glosaTef: string;
  holderName: string;
  holderRut: string;
  rowNumber: number;
  source: Record<string, string | number>;
};

const sectorEnd = 0xfffffffe;
const sectorFree = 0xffffffff;
const bankNamesByCode: Record<string, string> = {
  "1": "BANCO DE CHILE / EDWARDS",
  "12": "BANCO ESTADO",
  "14": "SCOTIABANK",
  "16": "BCI",
  "28": "BANCO BICE",
  "37": "BANCO SANTANDER CHILE",
  "39": "ITAU",
  "49": "BANCO SECURITY",
  "51": "BANCO FALABELLA",
  "53": "BANCO RIPLEY",
  "875": "MERCADO PAGO"
};

type CfbDirectoryEntry = {
  name: string;
  size: number;
  startSector: number;
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function money(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function looksLikeRut(value: string) {
  return /^[0-9]{7,9}[0-9K]$/i.test(normalizeRut(value).replace(/-/g, ""));
}

function readSector(buffer: Buffer, sectorSize: number, sector: number) {
  const start = (sector + 1) * sectorSize;
  return buffer.subarray(start, start + sectorSize);
}

function sectorChain(fat: number[], start: number) {
  const chain: number[] = [];
  let sector = start;
  const seen = new Set<number>();
  while (sector >= 0 && sector !== sectorEnd && sector !== sectorFree && !seen.has(sector)) {
    seen.add(sector);
    chain.push(sector);
    sector = fat[sector] ?? sectorEnd;
  }
  return chain;
}

function readDirectory(buffer: Buffer) {
  const sectorSize = 1 << buffer.readUInt16LE(30);
  const fatSectorCount = buffer.readUInt32LE(44);
  const directoryStart = buffer.readUInt32LE(48);
  const difat = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = buffer.readUInt32LE(76 + index * 4);
    if (sector !== sectorFree) difat.push(sector);
  }
  const fat: number[] = [];
  for (const sector of difat.slice(0, fatSectorCount)) {
    const bytes = readSector(buffer, sectorSize, sector);
    for (let offset = 0; offset < bytes.length; offset += 4) fat.push(bytes.readUInt32LE(offset));
  }
  const directoryBytes = Buffer.concat(sectorChain(fat, directoryStart).map((sector) => readSector(buffer, sectorSize, sector)));
  const entries: CfbDirectoryEntry[] = [];
  for (let offset = 0; offset + 128 <= directoryBytes.length; offset += 128) {
    const entry = directoryBytes.subarray(offset, offset + 128);
    const nameLength = entry.readUInt16LE(64);
    if (nameLength < 2) continue;
    const name = entry.subarray(0, nameLength - 2).toString("utf16le");
    const startSector = entry.readUInt32LE(116);
    const size = Number(entry.readBigUInt64LE(120));
    entries.push({ name, size, startSector });
  }
  return {
    entries,
    readStream(name: string) {
      const entry = entries.find((item) => item.name === name || item.name === `${name}\0`);
      if (!entry) throw new Error(`xls_stream_not_found:${name}`);
      return Buffer.concat(sectorChain(fat, entry.startSector).map((sector) => readSector(buffer, sectorSize, sector))).subarray(0, entry.size);
    }
  };
}

function decodeRk(value: number) {
  const divided = (value & 1) !== 0;
  const isInteger = (value & 2) !== 0;
  let decoded: number;
  if (isInteger) decoded = value >> 2;
  else {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32LE(value & 0xfffffffc, 4);
    decoded = bytes.readDoubleLE(0);
  }
  return divided ? decoded / 100 : decoded;
}

function parseSst(data: Buffer) {
  const strings: string[] = [];
  let offset = 8;
  const totalUnique = data.readUInt32LE(4);
  for (let index = 0; index < totalUnique && offset + 3 <= data.length; index += 1) {
    const length = data.readUInt16LE(offset);
    const flags = data.readUInt8(offset + 2);
    offset += 3;
    const richText = (flags & 0x08) !== 0;
    const extended = (flags & 0x04) !== 0;
    const isUtf16 = (flags & 0x01) !== 0;
    const richRuns = richText ? data.readUInt16LE(offset) : 0;
    if (richText) offset += 2;
    const extensionSize = extended ? data.readUInt32LE(offset) : 0;
    if (extended) offset += 4;
    const byteLength = length * (isUtf16 ? 2 : 1);
    const textBytes = data.subarray(offset, offset + byteLength);
    strings.push(isUtf16 ? textBytes.toString("utf16le") : textBytes.toString("latin1"));
    offset += byteLength + richRuns * 4 + extensionSize;
  }
  return strings;
}

function parseBiffWorkbook(buffer: Buffer) {
  const rows = new Map<number, Map<number, string | number>>();
  let strings: string[] = [];
  for (let offset = 0; offset + 4 <= buffer.length;) {
    const type = buffer.readUInt16LE(offset);
    const length = buffer.readUInt16LE(offset + 2);
    const data = buffer.subarray(offset + 4, offset + 4 + length);
    offset += 4 + length;
    if (type === 0x00fc) strings = parseSst(data);
    if (type === 0x00fd && data.length >= 10) {
      const row = data.readUInt16LE(0);
      const col = data.readUInt16LE(2);
      const sstIndex = data.readUInt32LE(6);
      if (!rows.has(row)) rows.set(row, new Map());
      rows.get(row)?.set(col, strings[sstIndex] ?? "");
    }
    if (type === 0x0203 && data.length >= 14) {
      const row = data.readUInt16LE(0);
      const col = data.readUInt16LE(2);
      if (!rows.has(row)) rows.set(row, new Map());
      rows.get(row)?.set(col, data.readDoubleLE(6));
    }
    if (type === 0x027e && data.length >= 10) {
      const row = data.readUInt16LE(0);
      const col = data.readUInt16LE(2);
      if (!rows.has(row)) rows.set(row, new Map());
      rows.get(row)?.set(col, decodeRk(data.readUInt32LE(6)));
    }
    if (type === 0x00bd && data.length >= 8) {
      const row = data.readUInt16LE(0);
      const firstCol = data.readUInt16LE(2);
      const lastCol = data.readUInt16LE(data.length - 2);
      if (!rows.has(row)) rows.set(row, new Map());
      for (let col = firstCol; col <= lastCol; col += 1) {
        const rkOffset = 4 + (col - firstCol) * 6 + 2;
        if (rkOffset + 4 <= data.length - 2) rows.get(row)?.set(col, decodeRk(data.readUInt32LE(rkOffset)));
      }
    }
  }
  return [...rows.entries()].sort((left, right) => left[0] - right[0]).map(([rowNumber, cells]) => ({ cells, rowNumber: rowNumber + 1 }));
}

export function parseHrBankWorkbook(buffer: Buffer): HrBankImportRow[] {
  const directory = readDirectory(buffer);
  const workbook = directory.readStream("Workbook");
  const rows = parseBiffWorkbook(workbook);
  const headerRow = rows.find((row) => [...row.cells.values()].some((cell) => normalizeHeader(String(cell)) === "glosa_tef"));
  if (!headerRow) throw new Error("hr_bank_headers_not_found");
  const headers = new Map<number, string>();
  for (const [column, value] of headerRow.cells.entries()) headers.set(column, normalizeHeader(String(value)));
  return rows.filter((row) => row.rowNumber > headerRow.rowNumber).map((row) => {
    const source: Record<string, string | number> = {};
    for (const [column, value] of row.cells.entries()) {
      const header = headers.get(column);
      if (header) source[header] = typeof value === "number" ? value : cleanText(value);
    }
    const bankCode = cleanText(source.cod_banco);
    const holderRut = normalizeRut(cleanText(source.rut_benef));
    const holderName = cleanText(source.nombre_benef);
    const bankMapping = mapBankName(bankCode);
    const accountNumber = cleanText(source.cta_destino);
    const glosaTef = cleanText(source.glosa_tef);
    return {
      accountNumber,
      amount: money(source.mto_total),
      bankCode,
      bankName: bankNamesByCode[bankCode] ?? (bankMapping.needsReview ? "" : bankMapping.bankNameNormalized),
      email: cleanText(source.correo),
      glosaTef,
      holderName,
      holderRut: looksLikeRut(holderRut) ? holderRut : "",
      rowNumber: row.rowNumber,
      source
    };
  }).filter((row) => row.accountNumber || row.holderName || row.glosaTef);
}
