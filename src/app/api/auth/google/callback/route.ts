import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");
  const baseUrl = request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/?sync=error&message=${encodeURIComponent("Google authorization denied")}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/?sync=error&message=${encodeURIComponent("No authorization code received")}`
    );
  }

  // Validate state parameter against the cookie to prevent CSRF
  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      `${baseUrl}/?sync=error&message=${encodeURIComponent("Invalid OAuth state. Please try again.")}`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Store token in HttpOnly cookie — never exposed to client JavaScript
    const response = NextResponse.redirect(`${baseUrl}/?sync=ready`);

    response.cookies.set("google_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600, // 1 hour (Google access tokens expire in ~1 hour)
    });

    // Clear the state cookie
    response.cookies.delete("oauth_state");

    return response;
  } catch {
    return NextResponse.redirect(
      `${baseUrl}/?sync=error&message=${encodeURIComponent("Failed to complete authorization")}`
    );
  }
}
