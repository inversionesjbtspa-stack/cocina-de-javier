import { connect, type TLSSocket } from "node:tls";

type ImapXmlAttachment = {
  messageId: string;
  threadId: string | null;
  attachmentId: string;
  filename: string;
  receivedAt: string | null;
  sender: string | null;
  subject: string | null;
  xml: string;
};

type ImapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

type MimePart = {
  headers: Record<string, string>;
  body: string;
};

function getImapConfig(): ImapConfig {
  const host = process.env.DTE_IMAP_HOST ?? "imap.gmail.com";
  const port = Number(process.env.DTE_IMAP_PORT ?? 993);
  const user = process.env.DTE_IMAP_USER ?? process.env.DTE_INBOX_EMAIL;
  const password = process.env.DTE_IMAP_APP_PASSWORD;

  if (!user || !password) {
    throw new Error("DTE IMAP credentials are not configured.");
  }

  return {
    host,
    port,
    user,
    password
  };
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
    if (encoding.toUpperCase() === "B") {
      return Buffer.from(text, "base64").toString(charset);
    }

    return text.replace(/_/g, " ");
  });
}

function parseHeaders(rawHeaders: string) {
  const headers: Record<string, string> = {};
  const lines = rawHeaders.replace(/\r\n[ \t]+/g, " ").split(/\r?\n/);

  for (const line of lines) {
    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    headers[line.slice(0, separator).toLowerCase()] = line
      .slice(separator + 1)
      .trim();
  }

  return headers;
}

function parseFilename(headers: Record<string, string>) {
  const disposition = headers["content-disposition"] ?? "";
  const type = headers["content-type"] ?? "";
  const source = `${disposition}; ${type}`;
  const match = source.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)/i);

  if (!match) {
    return null;
  }

  return decodeURIComponent(decodeMimeWords(match[1].replace(/"$/g, "")));
}

function parseMultipart(rawMessage: string): MimePart[] {
  const [rawHeaders, ...bodyParts] = rawMessage.split(/\r?\n\r?\n/);
  const headers = parseHeaders(rawHeaders);
  const body = bodyParts.join("\r\n\r\n");
  const boundaryMatch = headers["content-type"]?.match(/boundary="?([^";]+)"?/i);

  if (!boundaryMatch) {
    return [{ headers, body }];
  }

  const boundary = boundaryMatch[1];
  return body
    .split(`--${boundary}`)
    .filter((part) => part.trim() && !part.trim().startsWith("--"))
    .flatMap((part) => parseMultipart(part.replace(/^\r?\n/, "")));
}

function decodePartBody(headers: Record<string, string>, body: string) {
  const encoding = headers["content-transfer-encoding"]?.toLowerCase();

  if (encoding === "base64") {
    return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  }

  if (encoding === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      );
  }

  return body.trim();
}

class ImapSession {
  private socket: TLSSocket;
  private buffer = "";
  private tagCounter = 0;

  private constructor(socket: TLSSocket) {
    this.socket = socket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => {
      this.buffer += chunk;
    });
  }

  static async connect(config: ImapConfig) {
    const socket = connect({
      host: config.host,
      port: config.port,
      servername: config.host
    });

    const session = new ImapSession(socket);
    await session.waitFor("* OK");
    await session.command(`LOGIN ${quote(config.user)} ${quote(config.password)}`);
    return session;
  }

  close() {
    this.socket.end();
  }

  async command(command: string) {
    const tag = `A${String(++this.tagCounter).padStart(4, "0")}`;
    this.buffer = "";
    this.socket.write(`${tag} ${command}\r\n`);
    return this.waitFor(`${tag} OK`, `${tag} NO`, `${tag} BAD`);
  }

  private async waitFor(...needles: string[]) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 30000) {
      if (needles.some((needle) => this.buffer.includes(needle))) {
        return this.buffer;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error("IMAP command timed out.");
  }
}

function extractUids(searchResponse: string) {
  const max = Number(process.env.DTE_IMAP_MAX_MESSAGES ?? 50);
  const line = searchResponse
    .split(/\r?\n/)
    .find((item) => item.startsWith("* SEARCH"));

  if (!line) {
    return [];
  }

  return line
    .replace("* SEARCH", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-Math.max(1, max));
}

function extractLiteral(fetchResponse: string) {
  const literalStart = fetchResponse.indexOf("\r\n");
  const literalEnd = fetchResponse.lastIndexOf("\r\n)");

  if (literalStart === -1 || literalEnd === -1 || literalEnd <= literalStart) {
    return fetchResponse;
  }

  return fetchResponse.slice(literalStart + 2, literalEnd);
}

export async function fetchDteXmlAttachmentsViaImap(): Promise<ImapXmlAttachment[]> {
  const config = getImapConfig();
  const session = await ImapSession.connect(config);

  try {
    await session.command("SELECT INBOX");
    const search = await session.command('UID SEARCH NOT DELETED');
    const uids = extractUids(search);
    const attachments: ImapXmlAttachment[] = [];

    for (const uid of uids) {
      const fetch = await session.command(`UID FETCH ${uid} BODY.PEEK[]`);
      const rawMessage = extractLiteral(fetch);
      const parts = parseMultipart(rawMessage);
      const [rawHeaders] = rawMessage.split(/\r?\n\r?\n/);
      const messageHeaders = parseHeaders(rawHeaders);
      const subject = decodeMimeWords(messageHeaders.subject ?? "");
      const sender = decodeMimeWords(messageHeaders.from ?? "");
      const receivedAt = messageHeaders.date
        ? new Date(messageHeaders.date).toISOString()
        : null;
      const rawMessageId = messageHeaders["message-id"] ?? uid;

      for (const part of parts) {
        const filename = parseFilename(part.headers);

        if (!filename?.toLowerCase().endsWith(".xml")) {
          continue;
        }

        attachments.push({
          attachmentId: `${uid}:${filename}`,
          filename,
          messageId: rawMessageId,
          receivedAt,
          sender,
          subject,
          threadId: uid,
          xml: decodePartBody(part.headers, part.body)
        });
      }
    }

    return attachments;
  } finally {
    session.close();
  }
}
