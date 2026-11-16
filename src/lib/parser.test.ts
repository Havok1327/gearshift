import { describe, it, expect } from "vitest";
import { parseScheduleText, deduplicateShifts } from "@/lib/parser";

/**
 * Parser regression tests.
 *
 * ADDING A CASE FROM A BUG REPORT:
 * A Formspree report contains the exact OCR text the parser choked on. Paste it
 * into a new `it(...)` below as `text`, put the dates the screenshot really
 * shows in `expect`, and run `npm test`. It should fail. Fix the parser until it
 * passes and every other case still does — that last part is the whole point,
 * since the parser's rules interact and a fix for one format can silently break
 * another.
 *
 * Shifts are compared as "YYYY-MM-DD HH:mm-HH:mm Title" so a failure message
 * shows the dates directly instead of a wall of objects.
 */
function parse(text: string): string[] {
  return deduplicateShifts(parseScheduleText(text)).map(
    (s) => `${s.date} ${s.startTime}-${s.endTime} ${s.title}`
  );
}

describe("shift line formats", () => {
  it("Format A: day number, noise token and time on one line", () => {
    expect(
      parse(`February 2026 v
Fri
20 4 9:30 AM-5:30 PM [8:00]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual(["2026-02-20 09:30-17:30 Hardgoods - Cycling"]);
  });

  it("Format B: day number on its own line, no label", () => {
    expect(
      parse(`February 2026 v
Sat
21
10:00 AM-5:30 PM [7:30]
REI/REI/Store/Hardgoods/Action Sports`)
    ).toEqual(["2026-02-21 10:00-17:30 Hardgoods - Action Sports"]);
  });

  it("Format B: a shift label above the time wins over the dept path", () => {
    expect(
      parse(`February 2026 v
Mon
23
perf food stock
9:00 AM-5:30 PM [8:30]
REI/REI/Store/Product Movement/Stocking`)
    ).toEqual(["2026-02-23 09:00-17:30 perf food stock"]);
  });

  it("Format B+: day number, noise token and label, time on the next line", () => {
    expect(
      parse(`February 2026 v
Thu
26 & HG fit
8:00 AM-4:30 PM [8:30]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual(["2026-02-26 08:00-16:30 HG fit"]);
  });

  it("reads a period as a time separator when OCR misses the colon", () => {
    expect(
      parse(`February 2026 v
Sat
28 @» 1.00 PM-9:30 PM [8:30]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual(["2026-02-28 13:00-21:30 Hardgoods - Cycling"]);
  });

  it("skips Time Off entries", () => {
    expect(
      parse(`November 2026 v
November 29 - December 05
Fri
4 ® [Approved]
RETAIL Time Off NE
(Full)`)
    ).toEqual([]);
  });
});

describe("working out which week a shift belongs to", () => {
  it("splits a week header that spans two months", () => {
    expect(
      parse(`May 2026 v
May 31 - June 06
Sun
31
9:00 AM-5:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling
Wed
3
10:00 AM-6:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual([
      "2026-05-31 09:00-17:00 Hardgoods - Cycling",
      "2026-06-03 10:00-18:00 Hardgoods - Cycling",
    ]);
  });

  it("trusts the next week header over a lagging month dropdown", () => {
    // The dropdown shows the *selected* month, so a shift whose own week header
    // scrolled off the top can be in the month after the one it displays.
    expect(
      parse(`September 2026 v
Sat
3
8:00 AM-4:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling
October 04 - 10
Tue
6
9:00 AM-5:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual([
      "2026-10-03 08:00-16:00 Hardgoods - Cycling",
      "2026-10-06 09:00-17:00 Hardgoods - Cycling",
    ]);
  });

  it("lets a disagreeing weekday veto an inferred week", () => {
    // Oct 3 2026 is a Saturday, so a "Mon" line means a week header went
    // missing rather than the dropdown lagging. Fall back to the dropdown.
    expect(
      parse(`September 2026 v
Mon
3
8:00 AM-4:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling
October 04 - 10`)
    ).toEqual(["2026-09-03 08:00-16:00 Hardgoods - Cycling"]);
  });

  it("rolls the year over on a December-to-January week", () => {
    expect(
      parse(`December 2026 v
December 28 - January 03
Thu
31
9:00 AM-5:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling
Sat
2
10:00 AM-6:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual([
      "2026-12-31 09:00-17:00 Hardgoods - Cycling",
      "2027-01-02 10:00-18:00 Hardgoods - Cycling",
    ]);
  });

  it("rolls the year over when the dropdown lags across New Year", () => {
    expect(
      parse(`December 2026 v
January 04 - 10
Tue
5
9:00 AM-5:00 PM [8:00]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual(["2027-01-05 09:00-17:00 Hardgoods - Cycling"]);
  });
});

describe("recovering day numbers OCR got wrong", () => {
  // Seven consecutive dates contain each weekday exactly once, so once the week
  // is known the surviving "Sat"/"Tue" line pins the date on its own.

  it("recovers a dropped leading digit before a week header (21 read as 1)", () => {
    expect(
      parse(`November 2026 v
Sat
1 C, 8:30 AM-3:00 PM [6:30]
November 22 - 28`)
    ).toEqual(["2026-11-21 08:30-15:00 Work Shift"]);
  });

  it("recovers a dropped leading digit after a week header (24 read as 4)", () => {
    expect(
      parse(`November 2026 v
November 22 - 28
Tue
4 &» safety trn
9:30 AM-3:30 PM [6:00]`)
    ).toEqual(["2026-11-24 09:30-15:30 safety trn"]);
  });

  it("recovers a day number lost entirely (11 read as n)", () => {
    expect(
      parse(`November 2026 v
November 22 - 28
Thu
n & 7:00 AM-3:30 PM [8:30]
REI/REI/Store/Hardgoods/Cycling`)
    ).toEqual(["2026-11-26 07:00-15:30 Hardgoods - Cycling"]);
  });
});

describe("reported bugs", () => {
  it("v1.75.9: Sat 21 was being read as Nov 1", () => {
    // Verbatim OCR from the bug report, phone status bar and nav chrome included.
    expect(
      parse(`7:25 « @ R= al @&
<& My Schedule
vie
Shortcuts v
November 2026 v
You have nothing planned.
Sat
1 C, 8:30 AM-3:00 PM [6:30]
November 22 - 28
Tue
24 &» safety trn
9:30 AM-3:30 PM [6:00]
November 29 - December 05
Fri
4 ® [Approved]
RETAIL Time Off NE
(Full)
A) fal) =
Home Inbox Menu`)
    ).toEqual([
      "2026-11-21 08:30-15:00 Work Shift",
      "2026-11-24 09:30-15:30 safety trn",
    ]);
  });
});

describe("deduplication", () => {
  it("drops shifts repeated across overlapping screenshots", () => {
    const screenshot = `November 2026 v
November 22 - 28
Tue
24 &» safety trn
9:30 AM-3:30 PM [6:00]`;
    expect(parse(`${screenshot}\n${screenshot}`)).toEqual([
      "2026-11-24 09:30-15:30 safety trn",
    ]);
  });
});
