import { z } from "zod";

export const dteInboxConfigSchema = z.object({
  email: z.string().email(),
  provider: z.enum(["google-workspace"]),
  authMethod: z.enum(["oauth", "imap"])
});

export const dteInboxConfig = dteInboxConfigSchema.parse({
  email: process.env.DTE_INBOX_EMAIL ?? "dte@lacocinadejavier.cl",
  provider: process.env.DTE_INBOX_PROVIDER ?? "google-workspace",
  authMethod: process.env.DTE_INBOX_AUTH_METHOD ?? "imap"
});

export const DTE_XML_GMAIL_QUERY =
  "to:dte@lacocinadejavier.cl has:attachment filename:xml -in:trash -in:spam";

export function hasGoogleOAuthConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

export function hasDteImapConfig() {
  return Boolean(
    process.env.DTE_IMAP_HOST &&
      process.env.DTE_IMAP_PORT &&
      process.env.DTE_IMAP_USER &&
      process.env.DTE_IMAP_APP_PASSWORD
  );
}
