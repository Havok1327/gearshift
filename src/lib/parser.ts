import { Shift } from "@/types";

let nextId = 1;
function generateId(): string {
  return String(nextId++);
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", oct: "10", nov: "11", dec: "12",
};

const DAY_NAMES = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i;

const MONTH_PREFIX_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2}\s*[AaPp][Mm])\s*[-–—]\s*(\d{1,2}[:.]\d{2}\s*[AaPp][Mm])/;

/**
 * Parse raw OCR text from mobile schedule screenshots.
 *
 * Handles two formats observed in the wild:
 *
 * Format A — day number on same line as time (older):
 *   February 2026 v
 *   Fri
 *   20 4 9:30 AM-5:30 PM [8:00]
 *   Org/Org/Dept/Region/...
 *
 * Format B — day number on its own line, optional shift label (newer):
 *   February 2026 v
 *   Sat
 *   21
 *   10:00 AM-5:30 PM [7:30]        ← no label
 *   REI/REI/.../Hardgoods/Action Sports
 *
 *   Mon
 *   23
 *   perf food stock                 ← optional shift label
 *   9:00 AM-5:30 PM [8:30]
 *   REI/REI/.../Product Movement/Stocking
 *
 * "Time Off Unpaid" entries are detected and skipped.
 */
export function parseScheduleText(rawText: string): Shift[] {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const shifts: Shift[] = [];

  let currentMonth = "";
  let currentYear = "";

  // State for Format B parsing
  let afterDayName = false;  // true after seeing Mon/Tue/etc.
  let pendingDay = "";       // day number seen on its own line
  let pendingLabel = "";     // optional shift label between day# and time
  let skipNextShift = false; // true when "Time Off" detected

  function resetDayState() {
    afterDayName = false;
    pendingDay = "";
    pendingLabel = "";
    skipNextShift = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Month/year header: "February 2026 v" or "February 2026"
    const monthYearMatch = line.match(
      /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i
    );
    if (monthYearMatch) {
      currentMonth = MONTHS[monthYearMatch[1].toLowerCase().slice(0, 3)];
      currentYear = monthYearMatch[2];
      resetDayState();
      continue;
    }

    // Week header: "February 22 - 28" or "March O1 - 07" — can update current month
    const weekHeaderMatch = line.match(
      /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\S+\s*[-–—]\s*\S+/i
    );
    if (weekHeaderMatch) {
      currentMonth = MONTHS[weekHeaderMatch[1].toLowerCase().slice(0, 3)];
      resetDayState();
      continue;
    }

    // Day-of-week line: "Fri", "Sat", etc.
    if (DAY_NAMES.test(line) && line.length <= 10) {
      resetDayState();
      afterDayName = true;
      continue;
    }

    // UI chrome — skip
    if (/^(Home|Inbox|Menu|Schedule|My Schedule|Request)/i.test(line)) {
      continue;
    }

    // Standalone duration like "[7:30]" — skip
    if (/^\[\d+:\d+\]$/.test(line)) {
      continue;
    }

    // "Time Off" entries — mark the upcoming time range for skipping
    if (/time off/i.test(line)) {
      skipNextShift = true;
      pendingLabel = "";
      continue;
    }

    // Format B: standalone day number after a day-of-week line
    if (afterDayName && /^\d{1,2}$/.test(line)) {
      pendingDay = line.padStart(2, "0");
      afterDayName = false;
      continue;
    }

    // Format B+ / Format A+: day number + OCR noise token after a day-of-week line
    // e.g. "26 & HG fit"        → label, time on next line (Format B+)
    //      "3 > 8:00 AM-4:30"   → time on this line (Format A+), fall through
    //      "28 @» 1.00 PM-9:30" → time on this line with OCR'd period, fall through
    if (afterDayName) {
      const noisyDayLine = line.match(/^(\d{1,2})\s+\S+\s*(.*)/);
      if (noisyDayLine) {
        const dayNum = noisyDayLine[1].padStart(2, "0");
        const remainder = noisyDayLine[2].trim();
        if (TIME_RANGE_RE.test(remainder)) {
          // Time is on this same line — set pendingDay and fall through to timeMatch
          pendingDay = dayNum;
        } else {
          // Time is on next line — Format B+ with noise
          pendingDay = dayNum;
          pendingLabel = remainder;
          afterDayName = false;
          continue;
        }
      }
    }

    afterDayName = false;

    // Time range line (both formats)
    const timeMatch = line.match(TIME_RANGE_RE);
    if (timeMatch && currentMonth && currentYear) {
      if (skipNextShift) {
        resetDayState();
        continue;
      }

      const startTime = normalizeTo24h(timeMatch[1]);
      const endTime = normalizeTo24h(timeMatch[2]);

      // Format B: day came from a prior standalone-number line
      // Format A: day number is at the start of this same line
      let day = pendingDay;
      if (!day) {
        const oldFormatMatch = line.match(/^(\d{1,2})\s+/);
        if (oldFormatMatch) {
          day = oldFormatMatch[1].padStart(2, "0");
        }
      }

      if (!day) {
        resetDayState();
        continue;
      }

      const date = `${currentYear}-${currentMonth}-${day}`;

      // Title priority:
      //   1. pendingLabel (shift type label above the time row, e.g. "perf food stock")
      //   2. Last two segments of the dept path below the time row
      let title = pendingLabel;

      if (!title) {
        let rawTitle = "";
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (DAY_NAMES.test(nextLine)) break;
          if (MONTH_PREFIX_RE.test(nextLine)) break;
          if (TIME_RANGE_RE.test(nextLine)) break;
          if (/^(Home|Inbox|Menu|Schedule|My Schedule)/i.test(nextLine)) break;
          if (/^\[\d+:\d+\]$/.test(nextLine)) continue; // skip duration lines
          if (nextLine.length > 0) {
            rawTitle = rawTitle ? rawTitle + " " + nextLine : nextLine;
          }
        }
        if (rawTitle.includes("/")) {
          const segments = rawTitle.split("/").map((s) => s.trim()).filter(Boolean);
          title = segments.length >= 2
            ? `${segments[segments.length - 2]} - ${segments[segments.length - 1]}`
            : segments[segments.length - 1] || "";
        } else {
          title = rawTitle;
        }
      }

      shifts.push({
        id: generateId(),
        date,
        startTime,
        endTime,
        title: title || "Work Shift",
      });

      resetDayState();
      continue;
    }

    // Format B: if we have a pending day and this is a plain text line, treat it as
    // the shift label (e.g. "perf food stock", "privacy awrnss")
    if (pendingDay && !line.includes("/")) {
      pendingLabel = line;
      continue;
    }
  }

  return shifts;
}

/**
 * Remove duplicate shifts by matching on date + startTime + endTime.
 * Keeps the first occurrence.
 */
export function deduplicateShifts(shifts: Shift[]): Shift[] {
  const seen = new Set<string>();
  return shifts.filter((shift) => {
    const key = `${shift.date}|${shift.startTime}|${shift.endTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTo24h(timeStr: string): string {
  const cleaned = timeStr.trim().toUpperCase();
  const isPM = cleaned.includes("P");
  const isAM = cleaned.includes("A");
  const timePart = cleaned.replace(/[APM\s]/g, "");
  const [hourStr, minute] = timePart.split(/[:.]/);
  let hour = parseInt(hourStr, 10);

  if (isPM && hour !== 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}
