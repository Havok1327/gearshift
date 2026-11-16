import { Shift } from "@/types";
import { generateId } from "@/lib/id";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", oct: "10", nov: "11", dec: "12",
};

const DAY_NAMES = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i;

const DAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const MONTH_PREFIX_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2}\s*[AaPp][Mm])\s*[-–—]\s*(\d{1,2}[:.]\d{2}\s*[AaPp][Mm])/;

// Week header: "February 22 - 28", "March O1 - 07", or a cross-month range like
// "May 31 - June 06". Captures: [1] start month, [2] start day, [3] end month.
const WEEK_HEADER_RE =
  /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\S+)\s*[-–—]\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\S+/i;

/**
 * The seven dates of one week, keyed by day-of-month.
 *
 * `certain` is true when the week came from a week header visible in the
 * screenshot, false when it was inferred from the next header down the page.
 * An inferred week is a good guess, not a fact, so a day-of-week name that
 * disagrees with it is allowed to veto it.
 */
type WeekWindow = {
  days: Map<number, { month: string; year: string }>;
  certain: boolean;
};

/** Map the seven dates starting at `startUtc` onto their day-of-month numbers. */
function buildWeek(startUtc: number, certain: boolean): WeekWindow {
  const days = new Map<number, { month: string; year: string }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(startUtc + i * 86400000);
    days.set(d.getUTCDate(), {
      month: String(d.getUTCMonth() + 1).padStart(2, "0"),
      year: String(d.getUTCFullYear()),
    });
  }
  return { days, certain };
}

/**
 * A week header names a month but never a year. The month dropdown supplies the
 * year, but the two can straddle a year boundary (dropdown "December" above a
 * "January 04 - 10" header, or the reverse).
 */
function resolveHeaderYear(
  headerMonth: number,
  dropdownMonth: string,
  dropdownYear: string
): number {
  const dm = parseInt(dropdownMonth, 10);
  const dy = parseInt(dropdownYear, 10);
  return dm - headerMonth > 6 ? dy + 1 : headerMonth - dm > 6 ? dy - 1 : dy;
}

/**
 * A screenshot usually starts mid-list, so the first visible shift often belongs
 * to a week whose header scrolled off the top. The only month context left is
 * the month dropdown, which shows the *selected* month and can lag the visible
 * week (e.g. dropdown "September 2026" above a shift that is really Oct 3).
 *
 * The next week header down the page pins it: that week is preceded by the seven
 * days ending the day before it starts.
 */
function buildPreHeaderWindow(
  lines: string[],
  startIdx: number,
  dropdownMonth: string,
  dropdownYear: string
): WeekWindow | null {
  for (let j = startIdx; j < lines.length; j++) {
    const m = lines[j].match(WEEK_HEADER_RE);
    if (!m) continue;

    const headerMonth = MONTHS[m[1].toLowerCase().slice(0, 3)];
    const headerDay = parseInt(m[2].replace(/\D/g, ""), 10);
    if (!headerMonth || !headerDay) return null;

    const hm = parseInt(headerMonth, 10);
    const anchor = Date.UTC(
      resolveHeaderYear(hm, dropdownMonth, dropdownYear),
      hm - 1,
      headerDay
    );
    return buildWeek(anchor - 7 * 86400000, false);
  }
  return null;
}

/**
 * Find the one day in a week that falls on the named weekday. Every weekday
 * appears exactly once in seven consecutive dates, so a surviving "Sat" picks
 * out a single date.
 */
function findDayByName(
  week: WeekWindow,
  dayName: string
): { day: number; month: string; year: string } | null {
  for (const [day, my] of Array.from(week.days.entries())) {
    if (matchesDayName(my.year, my.month, day, dayName)) {
      return { day, month: my.month, year: my.year };
    }
  }
  return null;
}

/** True when the given date falls on the weekday named by an OCR'd "Mon"/"Tue"/... line. */
function matchesDayName(year: string, month: string, day: number, dayName: string): boolean {
  const idx = dayNameToIndex(dayName);
  if (idx === null) return false;
  const d = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, day));
  return d.getUTCDay() === idx;
}

function dayNameToIndex(name: string): number | null {
  const key = name.toLowerCase().slice(0, 3);
  return key in DAY_INDEX ? DAY_INDEX[key] : null;
}

/**
 * When OCR garbles a day number (e.g. "11" misread as "N"), infer the day
 * from the surviving day-of-week name by scanning forward for the next
 * concrete day-name + day-number pair and back-calculating the weekday offset.
 */
function inferDayFromDayName(
  dayName: string,
  startIdx: number,
  lines: string[]
): number | null {
  const currentIdx = dayNameToIndex(dayName);
  if (currentIdx === null) return null;

  for (let j = startIdx; j < lines.length; j++) {
    const dayNameMatch = lines[j].match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i);
    if (!dayNameMatch || lines[j].length > 10) continue;

    for (let k = j + 1; k < lines.length && k - j <= 5; k++) {
      const m = lines[k].match(/^(\d{1,2})(?:\s|$)/);
      if (!m) continue;
      const num = parseInt(m[1], 10);
      if (num < 1 || num > 31) break;

      const nextIdx = dayNameToIndex(dayNameMatch[1]);
      if (nextIdx === null) break;
      let offset = (nextIdx - currentIdx + 7) % 7;
      if (offset === 0) offset = 7;
      const inferred = num - offset;
      return inferred >= 1 && inferred <= 31 ? inferred : null;
    }
  }
  return null;
}

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
  let lastDayNum = 0; // tracks last processed day for month-rollover detection

  // The week the current shift belongs to, when one is known: either from a
  // visible week header, or inferred for the week whose header scrolled off the
  // top of the screenshot.
  let currentWeek: WeekWindow | null = null;

  // State for Format B parsing
  let afterDayName = false;   // true after seeing Mon/Tue/etc.
  let pendingDay = "";        // day number seen on its own line
  let pendingDayName = "";    // surviving day-of-week name, used to infer a garbled day number
  let pendingLabel = "";      // optional shift label between day# and time
  let skipNextShift = false;  // true when "Time Off" detected

  function resetDayState() {
    afterDayName = false;
    pendingDay = "";
    pendingDayName = "";
    pendingLabel = "";
    skipNextShift = false;
  }

  function advanceMonth() {
    const m = parseInt(currentMonth, 10);
    if (m === 12) {
      currentMonth = "01";
      currentYear = String(parseInt(currentYear, 10) + 1);
    } else {
      currentMonth = String(m + 1).padStart(2, "0");
    }
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
      lastDayNum = 0;
      currentWeek = buildPreHeaderWindow(lines, i + 1, currentMonth, currentYear);
      resetDayState();
      continue;
    }

    // Week header: pins this week's seven dates exactly.
    const weekHeaderMatch = line.match(WEEK_HEADER_RE);
    if (weekHeaderMatch) {
      const startMonth = MONTHS[weekHeaderMatch[1].toLowerCase().slice(0, 3)];
      const startDay = parseInt(weekHeaderMatch[2].replace(/\D/g, ""), 10);
      if (startMonth && startDay && currentYear) {
        const sm = parseInt(startMonth, 10);
        // Read the dropdown month before currentMonth moves to the header's.
        const headerYear = resolveHeaderYear(sm, currentMonth, currentYear);
        currentWeek = buildWeek(Date.UTC(headerYear, sm - 1, startDay), true);
        currentMonth = startMonth;
        currentYear = String(headerYear);
      }
      resetDayState();
      continue;
    }

    // Day-of-week line: "Fri", "Sat", etc.
    if (DAY_NAMES.test(line) && line.length <= 10) {
      resetDayState();
      afterDayName = true;
      pendingDayName = line;
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

    // Format A / B+: day number followed by more content on the same line.
    // e.g. "3 4:00 PM-9:00 PM"   → time on this line, fall through (Format A)
    //      "3 > 8:00 AM-4:30"    → same, with an OCR noise token (Format A+)
    //      "28 @» 1.00 PM-9:30"  → same, with an OCR'd period separator
    //      "26 & HG fit"         → noise + label, time on the next line (Format B+)
    if (afterDayName) {
      const dayLine = line.match(/^(\d{1,2})\s+(.+)/);
      if (dayLine) {
        pendingDay = dayLine[1].padStart(2, "0");
        const rest = dayLine[2].trim();
        if (!TIME_RANGE_RE.test(rest)) {
          // Time is on a later line — drop the leading OCR noise token and take
          // what's left as the shift label.
          pendingLabel = rest.replace(/^\S+\s*/, "").trim();
          afterDayName = false;
          continue;
        }
        // Time is on this same line — fall through to timeMatch.
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

      // OCR-garbled day: the day number is gone entirely (e.g. "11" came
      // through as "N"), but the "Thu" line survived. A known week names each
      // weekday exactly once, so it pins the date outright. Failing that, fall
      // back to scanning ahead for a day-name + day-number pair to count from.
      if (!day && pendingDayName) {
        const fromWeek = currentWeek && findDayByName(currentWeek, pendingDayName);
        if (fromWeek) {
          day = String(fromWeek.day).padStart(2, "0");
        } else {
          const inferred = inferDayFromDayName(pendingDayName, i + 1, lines);
          if (inferred !== null) {
            day = String(inferred).padStart(2, "0");
          }
        }
      }

      if (!day) {
        resetDayState();
        continue;
      }

      let dayNum = parseInt(day, 10);
      let year = currentYear;
      let month = currentMonth;

      const hit = currentWeek?.days.get(dayNum);
      const hitMatchesName =
        !!hit &&
        (!pendingDayName ||
          matchesDayName(hit.year, hit.month, dayNum, pendingDayName));

      if (hit && hitMatchesName) {
        month = hit.month;
        year = hit.year;
      } else if (currentWeek && !hit && pendingDayName) {
        // The day number isn't one of the seven this week covers, so OCR
        // mangled it - a dropped leading digit turns "21" into "1". The week
        // fixes seven consecutive dates and the weekday name picks exactly one
        // of them, so a surviving "Sat" recovers the real date.
        const recovered = findDayByName(currentWeek, pendingDayName);
        if (recovered) {
          dayNum = recovered.day;
          day = String(recovered.day).padStart(2, "0");
          month = recovered.month;
          year = recovered.year;
        }
      } else if (hit && currentWeek?.certain) {
        // The day number is inside the week but the weekday name disagrees. A
        // visible header pins the week, so keep the in-range number.
        month = hit.month;
        year = hit.year;
      } else if (lastDayNum > 0 && dayNum < lastDayNum && lastDayNum - dayNum > 15) {
        // No usable week context: either none was found, or an inferred week was
        // vetoed by a disagreeing weekday name (which means a week header went
        // missing, not that the dropdown lagged). Fall back to the dropdown
        // month, where a large backward jump means the month rolled over.
        advanceMonth();
        month = currentMonth;
        year = currentYear;
      }

      lastDayNum = dayNum;

      const date = `${year}-${month}-${day}`;

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
