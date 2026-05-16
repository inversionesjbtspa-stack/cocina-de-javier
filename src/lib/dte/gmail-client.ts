import { DTE_XML_GMAIL_QUERY } from "@/lib/dte/inbox";

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

type GmailMessageResponse = {
  id: string;
  payload?: {
    parts?: GmailPart[];
  };
};

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: {
    attachmentId?: string;
  };
  parts?: GmailPart[];
};

type GmailAttachmentResponse = {
  data?: string;
};

export type GmailXmlAttachment = {
  messageId: string;
  attachmentId: string;
  filename: string;
  xml: string;
};

function requireGoogleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth environment variables are not configured.");
  }

  return {
    clientId,
    clientSecret,
    refreshToken
  };
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function flattenParts(parts: GmailPart[] = []): GmailPart[] {
  return parts.flatMap((part) => [part, ...flattenParts(part.parts)]);
}

async function getAccessToken() {
  const { clientId, clientSecret, refreshToken } = requireGoogleEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error("Could not refresh Google access token.");
  }

  const payload = (await response.json()) as { access_token?: string };

  if (!payload.access_token) {
    throw new Error("Google token response did not include access_token.");
  }

  return payload.access_token;
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Gmail API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchDteXmlAttachments({
  maxResults = 20
}: {
  maxResults?: number;
} = {}): Promise<GmailXmlAttachment[]> {
  const accessToken = await getAccessToken();
  const query = encodeURIComponent(DTE_XML_GMAIL_QUERY);
  const list = await gmailFetch<GmailMessageListResponse>(
    accessToken,
    `/users/me/messages?q=${query}&maxResults=${maxResults}`
  );

  const attachments: GmailXmlAttachment[] = [];

  for (const message of list.messages ?? []) {
    const detail = await gmailFetch<GmailMessageResponse>(
      accessToken,
      `/users/me/messages/${message.id}?format=full`
    );
    const xmlParts = flattenParts(detail.payload?.parts).filter((part) => {
      const filename = part.filename ?? "";
      return filename.toLowerCase().endsWith(".xml") && part.body?.attachmentId;
    });

    for (const part of xmlParts) {
      const attachmentId = part.body?.attachmentId;

      if (!attachmentId || !part.filename) {
        continue;
      }

      const attachment = await gmailFetch<GmailAttachmentResponse>(
        accessToken,
        `/users/me/messages/${message.id}/attachments/${attachmentId}`
      );

      if (!attachment.data) {
        continue;
      }

      attachments.push({
        messageId: message.id,
        attachmentId,
        filename: part.filename,
        xml: base64UrlDecode(attachment.data)
      });
    }
  }

  return attachments;
}
