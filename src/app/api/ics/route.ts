import { NextRequest, NextResponse } from "next/server";

const MAX_ICS_SIZE = 1024 * 1024; // 1MB

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const icsContent = formData.get("icsContent");

  if (!icsContent || typeof icsContent !== "string") {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  if (icsContent.length > MAX_ICS_SIZE) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (!icsContent.startsWith("BEGIN:VCALENDAR")) {
    return NextResponse.json({ error: "Invalid ICS format" }, { status: 400 });
  }

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="schedule.ics"',
    },
  });
}
