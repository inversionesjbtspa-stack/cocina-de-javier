import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const workbookPath = process.argv[2];
const outputPath = process.argv[3] ?? "src/data/suppliers-master.json";

if (!workbookPath) {
  throw new Error("Usage: node scripts/extract-suppliers-master.mjs <master.xlsx> [output.json]");
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text"
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readXml(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) {
    throw new Error(`Missing ${name}`);
  }
  return parser.parse(entry.getData().toString("utf8"));
}

function columnFromRef(ref) {
  return String(ref ?? "").replace(/\d/g, "");
}

function normalizeText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("#text" in value) return normalizeText(value["#text"]);
    return Object.values(value).map(normalizeText).join("");
  }
  return String(value).trim();
}

function rutFormat(raw) {
  const clean = normalizeText(raw).toUpperCase().replace(/[^0-9K]/g, "");
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function cellValue(cell, sharedStrings) {
  const value = normalizeText(cell.v);
  if (cell.t === "s" && value) {
    return sharedStrings[Number(value)] ?? "";
  }
  return value;
}

function sharedStrings(zip) {
  const xml = readXml(zip, "xl/sharedStrings.xml");
  return asArray(xml.sst?.si).map((item) => {
    const text = item.t ?? asArray(item.r).map((run) => run.t).join("");
    return normalizeText(text);
  });
}

function workbookSheets(zip) {
  const workbook = readXml(zip, "xl/workbook.xml");
  const rels = readXml(zip, "xl/_rels/workbook.xml.rels");
  const relationships = asArray(rels.Relationships?.Relationship);
  return asArray(workbook.workbook?.sheets?.sheet).map((sheet) => {
    const rel = relationships.find((item) => item.Id === sheet["r:id"]);
    return {
      name: sheet.name,
      path: `xl/${rel.Target}`
    };
  });
}

function rowsBySheet(zip, sheetName, shared) {
  const sheet = workbookSheets(zip).find((item) => item.name === sheetName);
  if (!sheet) {
    throw new Error(`Missing sheet ${sheetName}`);
  }
  const xml = readXml(zip, sheet.path);
  return asArray(xml.worksheet?.sheetData?.row).map((row) => {
    const values = {};
    asArray(row.c).forEach((cell) => {
      values[columnFromRef(cell.r)] = cellValue(cell, shared);
    });
    return values;
  });
}

const zip = new AdmZip(workbookPath);
const shared = sharedStrings(zip);

const bankRows = rowsBySheet(zip, "CODIGOS SWFIT", shared);
const banks = new Map();
bankRows.forEach((row) => {
  if (/^\d+$/.test(row.B ?? "") && row.C) {
    banks.set(row.B, row.C);
  }
});

const rows = rowsBySheet(zip, "MASTER PROVEEDORES", shared).slice(1);
const seen = new Set();
const duplicateRuts = new Set();
let missingBankCode = 0;
let missingBankAccount = 0;
let missingEmail = 0;

const suppliers = rows
  .filter((row) => row.B || row.E)
  .map((row) => {
    const rut = rutFormat(row.E);
    if (seen.has(rut)) {
      duplicateRuts.add(rut);
    }
    seen.add(rut);

    const alerts = [];
    if (!row.G) {
      alerts.push("missing_bank_account");
      missingBankAccount += 1;
    }
    if (!row.H) {
      alerts.push("missing_bank_code");
      missingBankCode += 1;
    }
    if (!row.I) {
      alerts.push("missing_email");
      missingEmail += 1;
    }

    return {
      code: row.A ?? "",
      businessName: row.B ?? "",
      tradeName: row.B ?? "",
      category: row.C ?? "",
      documentType: row.D ?? "",
      rut,
      phone: row.F ?? "",
      bankAccount: row.G ?? "",
      bankCode: row.H ?? "",
      bankName: banks.get(row.H) ?? "",
      accountType: "",
      email: row.I ?? "",
      paymentTerms: "",
      observations: "",
      source: "master proveedores jesus",
      alerts
    };
  });

const output = {
  source: "master proveedores jesus",
  sourceFile: path.basename(workbookPath),
  generatedAt: new Date().toISOString(),
  columns: [
    "Cód. proveedor",
    "Razón social",
    "Grupo",
    "Tipo de documento",
    "Número",
    "Fono",
    "cuenta",
    "banco",
    "email"
  ],
  stats: {
    total: suppliers.length,
    duplicateRuts: [...duplicateRuts],
    missingBankCode,
    missingBankAccount,
    missingEmail
  },
  suppliers
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.stats, null, 2));
