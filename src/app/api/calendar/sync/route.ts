import { NextRequest, NextResponse } from "next/server";
import { createCalendarEvents } from "@/lib/google-calendar";
import { Shift } from "@/types";

export async function POST(request: NextRequest) {
  try {
    // Read token from HttpOnly cookie — not from request body
    const accessToken = request.cookies.get("google_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated. Please sign in with Google first." },
        { status: 401 }
      );
    }

    const { shifts } = (await request.json()) as { shifts: Shift[] };

    if (!shifts || shifts.length === 0) {
      return NextResponse.json(
        { error: "No shifts provided" },
        { status: 400 }
      );
    }

    const result = await createCalendarEvents(accessToken, shifts);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
