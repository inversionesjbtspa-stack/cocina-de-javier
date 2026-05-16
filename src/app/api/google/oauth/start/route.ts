import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildGoogleOAuthUrl, hasGoogleOAuthClientConfig } from "@/lib/google/oauth";

export async function GET() {
  if (!hasGoogleOAuthClientConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error: "google_oauth_client_not_configured",
        message:
          "Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before starting OAuth."
      },
      { status: 409 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(buildGoogleOAuthUrl({ state }));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/"
  });

  return response;
}
