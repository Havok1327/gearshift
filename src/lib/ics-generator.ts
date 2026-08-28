import { createEvents, EventAttributes } from "ics";
import { Shift } from "@/types";

export function generateIcs(shifts: Shift[]): string {
  // UIDs let a calendar app tell "new event" from "update to one I already
  // have". Two competing requirements:
  //
  //   1. Two shifts on the same day must get different UIDs, or the second
  //      silently overwrites the first on import.
  //   2. The UID must NOT change when a shift's times are edited, or
  //      re-importing a correction adds a second event instead of fixing the
  //      first.
  //
  // Keying on date + ordinal-within-day satisfies both: the ordinal is stable
  // across time edits, and it's distinct for same-day shifts. The first shift
  // of a day keeps the old bare-date UID so events exported before this change
  // still get updated rather than duplicated.
  const byDate = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const group = byDate.get(shift.date);
    if (group) group.push(shift);
    else byDate.set(shift.date, [shift]);
  }

  const ordinals = new Map<string, number>();
  // forEach rather than for..of: the project compiles to ES5, where iterating
  // a Map needs --downlevelIteration.
  byDate.forEach((group) => {
    // Sort by start time so the ordinal doesn't depend on the order the
    // caller happened to hand us the shifts in.
    group
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .forEach((shift, i) => ordinals.set(shift.id, i));
  });

  const events: EventAttributes[] = shifts.map((shift) => {
    const [year, month, day] = shift.date.split("-").map(Number);
    const [startHour, startMinute] = shift.startTime.split(":").map(Number);
    const [endHour, endMinute] = shift.endTime.split(":").map(Number);

    const ordinal = ordinals.get(shift.id) ?? 0;
    const uid =
      ordinal === 0
        ? `shift-${shift.date}@gearshift`
        : `shift-${shift.date}-${ordinal}@gearshift`;

    return {
      uid,
      title: shift.title || "Work Shift",
      start: [year, month, day, startHour, startMinute],
      end: [year, month, day, endHour, endMinute],
      status: "CONFIRMED" as const,
    };
  });

  const { value, error } = createEvents(events);

  if (error) {
    throw new Error(`Failed to generate ICS: ${error.message}`);
  }

  return value || "";
}

export async function downloadIcs(icsContent: string, filename = "schedule.ics") {
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIos) {
    // On iOS/iPadOS, blob downloads don't trigger the Calendar app.
    // Instead, POST the ICS to a server endpoint that responds with
    // Content-Type: text/calendar — Safari will then offer to open
    // the file in Calendar.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/ics";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "icsContent";
    input.value = icsContent;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } else {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
