import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import tls from "node:tls";

const root = resolve(process.cwd());
const outputPath = join(root, "preview", "dte-purchases-2026.json");
const user = process.env.DTE_IMAP_USER;
const password = process.env.DTE_IMAP_APP_PASSWORD;
const host = process.env.DTE_IMAP_HOST ?? "imap.gmail.com";
const port = Number(process.env.DTE_IMAP_PORT ?? 993);
const since = process.env.DTE_IMAP_SINCE ?? "1-Jan-2026";
const maxMessages = Number(process.env.DTE_IMAP_MAX_MESSAGES ?? 0);

if (!user || !password) {
  throw new Error("Set DTE_IMAP_USER and DTE_IMAP_APP_PASSWORD before running this script.");
}

function formatClp(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function blocks(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi"))].map(
    (match) => match[1]
  );
}

function numberValue(value) {
  const normalized = String(value ?? "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseDteXml(xml, source) {
  const tipoDte = tag(xml, "TipoDTE");
  const folio = tag(xml, "Folio");
  const rutEmisor = tag(xml, "RUTEmisor");
  const razonSocialEmisor = tag(xml, "RznSoc");
  const rutReceptor = tag(xml, "RUTRecep");
  const razonSocialReceptor = tag(xml, "RznSocRecep");
  const fechaEmision = tag(xml, "FchEmis");
  const formaPago = tag(xml, "FmaPago");
  const fechaVencimiento = tag(xml, "FchVenc");
  const montoNeto = numberValue(tag(xml, "MntNeto"));
  const montoExento = numberValue(tag(xml, "MntExe"));
  const iva = numberValue(tag(xml, "IVA"));
  const montoTotal = numberValue(tag(xml, "MntTotal"));

  if (!tipoDte || !folio || !rutEmisor || !fechaEmision || !montoTotal) {
    return null;
  }

  const items = blocks(xml, "Detalle").map((detail, index) => ({
    lineNumber: numberValue(tag(detail, "NroLinDet")) || index + 1,
    description: tag(detail, "NmbItem") || "Item sin descripcion",
    quantity: numberValue(tag(detail, "QtyItem")) || 1,
    unit: tag(detail, "UnmdItem") || "unidad",
    unitPrice: numberValue(tag(detail, "PrcItem")),
    lineTotal: numberValue(tag(detail, "MontoItem"))
  }));

  const xmlSha256 = sha256(xml);
  const normalizedKey = `${rutEmisor}|${tipoDte}|${folio}`;
  const isCreditNote = tipoDte === "61";

  return {
    idempotencyKey: `${normalizedKey}|${xmlSha256}`,
    normalizedKey,
    tipoDte,
    documentType: isCreditNote ? "Nota credito" : "Factura",
    folio,
    rutEmisor,
    razonSocialEmisor,
    rutReceptor,
    razonSocialReceptor,
    fechaEmision,
    fechaVencimiento: fechaVencimiento || addDays(fechaEmision, 30),
    formaPago,
    montoNeto,
    montoExento,
    iva,
    montoTotal,
    montoTotalClp: formatClp(montoTotal),
    xmlSha256,
    paymentStatus: "Pendiente",
    source,
    items
  };
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function decodeMimeWords(value) {
  return String(value ?? "").replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_all, charset, encoding, encoded) => {
    const data =
      String(encoding).toUpperCase() === "B"
        ? Buffer.from(encoded, "base64")
        : Buffer.from(encoded.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), "binary");
    return decodeBuffer(data, charset);
  });
}

function decodeBuffer(buffer, charset = "utf-8") {
  const normalized = String(charset || "utf-8").toLowerCase();
  if (normalized.includes("iso-8859-1") || normalized.includes("latin1")) {
    return buffer.toString("latin1");
  }
  return buffer.toString("utf8");
}

function decodeQuotedPrintable(value) {
  const compact = String(value ?? "").replace(/=\r?\n/g, "");
  return Buffer.from(compact.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), "binary");
}

function parseHeaders(headerText) {
  const headers = new Map();
  const unfolded = String(headerText ?? "").replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }
    headers.set(line.slice(0, index).toLowerCase(), line.slice(index + 1).trim());
  }
  return headers;
}

function headerParam(value, name) {
  const match = String(value ?? "").match(new RegExp(`${name}\\*?=(?:"([^"]+)"|([^;]+))`, "i"));
  if (!match) {
    return "";
  }
  return decodeMimeWords((match[1] ?? match[2] ?? "").replace(/^utf-8''/i, ""));
}

function splitMime(raw, boundary) {
  const marker = `--${boundary}`;
  return String(raw ?? "")
    .split(marker)
    .slice(1)
    .filter((part) => !part.startsWith("--"))
    .map((part) => part.replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
}

function extractXmlAttachments(rawMessage) {
  const [headerText, ...bodyParts] = String(rawMessage ?? "").split(/\r?\n\r?\n/);
  const headers = parseHeaders(headerText);
  const body = bodyParts.join("\r\n\r\n");
  const contentType = headers.get("content-type") ?? "";
  const boundary = headerParam(contentType, "boundary");

  const parts = boundary ? splitMime(body, boundary) : [body];
  const queue = parts.map((part) => ({ part, parentBoundary: boundary }));
  const attachments = [];

  while (queue.length) {
    const current = queue.shift();
    const [partHeaderText, ...partBodyParts] = current.part.split(/\r?\n\r?\n/);
    const partHeaders = parseHeaders(partHeaderText);
    const partBody = partBodyParts.join("\r\n\r\n");
    const partContentType = partHeaders.get("content-type") ?? "";
    const nestedBoundary = headerParam(partContentType, "boundary");

    if (nestedBoundary) {
      for (const nested of splitMime(partBody, nestedBoundary)) {
        queue.push({ part: nested, parentBoundary: nestedBoundary });
      }
      continue;
    }

    const disposition = partHeaders.get("content-disposition") ?? "";
    const filename =
      headerParam(disposition, "filename") || headerParam(partContentType, "name") || "documento.xml";

    const isXml = /\.xml$/i.test(filename) || /xml/i.test(partContentType);
    if (!isXml) {
      continue;
    }

    const transferEncoding = (partHeaders.get("content-transfer-encoding") ?? "").toLowerCase();
    const charset = headerParam(partContentType, "charset") || "utf-8";
    const payload = partBody.trim();
    const buffer =
      transferEncoding === "base64"
        ? Buffer.from(payload.replace(/\s/g, ""), "base64")
        : transferEncoding === "quoted-printable"
          ? decodeQuotedPrintable(payload)
          : Buffer.from(payload, "utf8");

    const xml = decodeBuffer(buffer, charset);
    if (xml.includes("<DTE") || xml.includes("<EnvioDTE")) {
      attachments.push({ filename, xml });
    }
  }

  return attachments;
}

class ImapClient {
  constructor() {
    this.socket = null;
    this.buffer = "";
    this.tagCounter = 1;
  }

  connect() {
    return new Promise((resolveConnect, rejectConnect) => {
      this.socket = tls.connect(port, host, { servername: host }, () => resolveConnect());
      this.socket.setEncoding("utf8");
      this.socket.on("data", (chunk) => {
        this.buffer += chunk;
      });
      this.socket.on("error", rejectConnect);
    });
  }

  async waitFor(pattern) {
    const started = Date.now();
    while (!pattern.test(this.buffer)) {
      if (Date.now() - started > 120000) {
        throw new Error(`Timed out waiting for ${pattern}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
    const output = this.buffer;
    this.buffer = "";
    return output;
  }

  async command(commandText, timeoutPattern) {
    const tag = `A${String(this.tagCounter++).padStart(4, "0")}`;
    this.socket.write(`${tag} ${commandText}\r\n`);
    return this.waitFor(timeoutPattern ?? new RegExp(`${tag} (OK|NO|BAD)`, "i"));
  }

  async login() {
    await this.waitFor(/^\* OK/im);
    await this.command(`LOGIN "${user.replace(/"/g, '\\"')}" "${password.replace(/"/g, '\\"')}"`);
  }

  async selectInbox() {
    await this.command("SELECT INBOX");
  }

  async search() {
    const result = await this.command(`UID SEARCH SINCE ${since} SUBJECT "documento"`);
    const line = result.split(/\r?\n/).find((value) => value.startsWith("* SEARCH")) ?? "";
    let ids = line.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean);
    if (maxMessages > 0) {
      ids = ids.slice(-maxMessages);
    }
    return ids;
  }

  async fetchRaw(uid) {
    const tag = `A${String(this.tagCounter++).padStart(4, "0")}`;
    this.socket.write(`${tag} UID FETCH ${uid} (BODY.PEEK[])\r\n`);
    const rawResponse = await this.waitFor(new RegExp(`${tag} (OK|NO|BAD)`, "i"));
    const literalMatch = rawResponse.match(/\{(\d+)\}\r?\n([\s\S]*)\r?\n\)\r?\nA\d+ OK/i);
    return literalMatch ? literalMatch[2] : rawResponse;
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

function summarize(invoices) {
  const byDay = {};
  const byMonth = {};
  const byYear = {};
  const suppliers = {};
  const products = {};

  for (const invoice of invoices) {
    const date = invoice.fechaEmision;
    const month = date.slice(0, 7);
    const year = date.slice(0, 4);
    const multiplier = invoice.tipoDte === "61" ? -1 : 1;

    for (const bucket of [
      [byDay, date],
      [byMonth, month],
      [byYear, year]
    ]) {
      const [target, key] = bucket;
      target[key] ??= { key, documents: 0, invoices: 0, creditNotes: 0, total: 0, iva: 0 };
      target[key].documents += 1;
      target[key].invoices += invoice.tipoDte === "61" ? 0 : 1;
      target[key].creditNotes += invoice.tipoDte === "61" ? 1 : 0;
      target[key].total += multiplier * invoice.montoTotal;
      target[key].iva += multiplier * invoice.iva;
    }

    suppliers[invoice.rutEmisor] ??= {
      rut: invoice.rutEmisor,
      razonSocial: invoice.razonSocialEmisor,
      documents: 0,
      total: 0
    };
    suppliers[invoice.rutEmisor].documents += 1;
    suppliers[invoice.rutEmisor].total += multiplier * invoice.montoTotal;

    for (const item of invoice.items) {
      const key = item.description.toLowerCase();
      products[key] ??= {
        description: item.description,
        quantity: 0,
        documents: 0,
        total: 0,
        lastPrices: []
      };
      products[key].quantity += item.quantity;
      products[key].documents += 1;
      products[key].total += item.lineTotal;
      products[key].lastPrices.push({
        date: invoice.fechaEmision,
        folio: invoice.folio,
        supplier: invoice.razonSocialEmisor,
        unitPrice: item.unitPrice
      });
      products[key].lastPrices = products[key].lastPrices
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
    }
  }

  const decorate = (values) =>
    Object.values(values)
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((row) => ({ ...row, totalClp: formatClp(row.total), ivaClp: formatClp(row.iva ?? 0) }));

  return {
    byDay: decorate(byDay),
    byMonth: decorate(byMonth),
    byYear: decorate(byYear),
    suppliers: Object.values(suppliers)
      .sort((a, b) => b.total - a.total)
      .map((row) => ({ ...row, totalClp: formatClp(row.total) })),
    products: Object.values(products)
      .sort((a, b) => b.total - a.total)
      .map((row) => ({ ...row, totalClp: formatClp(row.total) }))
  };
}

async function main() {
  const client = new ImapClient();
  const invoicesByKey = new Map();
  const errors = [];

  console.log(`Connecting to ${host}:${port} as ${user}`);
  await client.connect();
  await client.login();
  await client.selectInbox();

  const ids = await client.search();
  console.log(`Messages found since ${since}: ${ids.length}`);

  let processed = 0;
  for (const uid of ids) {
    processed += 1;
    try {
      const raw = await client.fetchRaw(uid);
      const attachments = extractXmlAttachments(raw);
      for (const attachment of attachments) {
        const invoice = parseDteXml(attachment.xml, {
          uid,
          filename: attachment.filename,
          xmlSha256: sha256(attachment.xml)
        });
        if (!invoice) {
          continue;
        }
        const current = invoicesByKey.get(invoice.normalizedKey);
        if (!current || current.source.uid < uid) {
          invoicesByKey.set(invoice.normalizedKey, invoice);
        }
      }
    } catch (error) {
      errors.push({ uid, message: error instanceof Error ? error.message : String(error) });
    }

    if (processed % 100 === 0 || processed === ids.length) {
      console.log(`Processed ${processed}/${ids.length}. XML documents: ${invoicesByKey.size}`);
    }
  }

  client.close();

  const invoices = [...invoicesByKey.values()].sort((a, b) => {
    const byDate = b.fechaEmision.localeCompare(a.fechaEmision);
    return byDate || Number(b.folio) - Number(a.folio);
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceMailbox: user,
    since,
    messageCount: ids.length,
    invoiceCount: invoices.length,
    invoices,
    summaries: summarize(invoices),
    errors
  };

  if (!existsSync(dirname(outputPath))) {
    mkdirSync(dirname(outputPath), { recursive: true });
  }
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
  console.log(`Invoices: ${payload.invoiceCount}`);
  console.log(`Errors: ${errors.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
