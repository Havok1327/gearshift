import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-calendar";
import { randomBytes } from "crypto";

export async function GET() {
  try {
    const state = randomBytes(32).toString("hex");
    const authUrl = getGoogleAuthUrl(state);

    const response = NextResponse.redirect(authUrl);

    // Store state in HttpOnly cookie for CSRF validation in callback
    response.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.GOOGLE_REDIRECT_URI;
    if (!baseUrl) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 500 }
      );
    }
    return NextResponse.redirect(
      new URL("/?sync=error&message=Google+OAuth+not+configured", baseUrl)
    );
  }
}
