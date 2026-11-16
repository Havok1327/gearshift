# GearShift — Project Reference

## What It Is
A Next.js 14 web app that converts work schedule screenshots into calendar events. Users photograph their scheduling app, OCR extracts the shift data, they review/edit it, then export to Apple Calendar (.ics) or Google Calendar.

**Key constraint: everything runs client-side. No user data hits a server.** (The only server endpoint is `/api/ics`, which exists solely to serve the `.ics` file with the correct `Content-Type` header for iOS Safari — it doesn't store anything.)

## Stack
- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Tesseract.js v7** — browser-based OCR
- **ics v3** — generates `.ics` files
- **googleapis** — installed but the Google Calendar flow uses direct URL opens, no OAuth
- **Formspree** — client-side bug report form submissions (endpoint: `https://formspree.io/f/meelrayd`)
- **Vitest** — parser regression tests (`npm test`); the only test tooling in the repo

## File Map
```
src/
  app/
    page.tsx              # Root page — workflow state machine (upload→process→review→export)
    layout.tsx            # PWA metadata, Geist fonts, viewport config
    globals.css
    api/
      ics/route.ts        # POST: echoes ICS content with text/calendar header (iOS workaround)
      auth/google/        # Unused OAuth routes
      calendar/sync/      # Unused sync route
  components/
    ImageUpload.tsx        # Drag-and-drop + file input; emits dataUrls[]
    OcrProcessor.tsx       # Runs Tesseract on each image, shows progress, calls parser; tags each shift with imageIndex
    ShiftTable.tsx         # Editable shift cards + per-device default title + raw OCR debug view + per-card screenshot viewer
    ExportOptions.tsx      # ICS download button + Google Calendar step-through UI
  lib/
    parser.test.ts         # Parser regression suite — add a case per bug report
    ocr.ts                 # Thin Tesseract.js wrapper → { text, confidence }
    id.ts                  # Shared collision-free id generator (crypto.randomUUID)
    parser.ts              # Regex parser: OCR text → Shift[]; deduplication; 12h→24h
    ics-generator.ts       # Shift[] → ICS string; iOS vs desktop download strategy
  types/
    index.ts               # Shift, ParsedSchedule, WorkflowStep
```

## Data Model
```ts
interface Shift {
  id: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm (24h)
  endTime: string;    // HH:mm (24h)
  title: string;
  imageIndex?: number; // which source screenshot this shift came from
}

type WorkflowStep = "upload" | "processing" | "review" | "export";
```

## Parser Logic (`src/lib/parser.ts`)
Tailored to a specific scheduling app's OCR output. Handles **two formats** observed in the wild:

**Format A** (older) — day number on same line as time:
```
February 2026 v
Fri
20 4 9:30 AM-5:30 PM [8:00]
REI/REI/.../Hardgoods/Cycling
```

**Format B** (newer) — day number on its own line, optional shift label:
```
February 2026 v
Sat
21
10:00 AM-5:30 PM [7:30]          ← no label case
REI/REI/.../Hardgoods/Action Sports

Mon
23
perf food stock                   ← optional label before time
9:00 AM-5:30 PM [8:30]
REI/REI/.../Product Movement/Stocking
```

**Format B+/A+** (noisy day lines) — day number + OCR noise token on one line:
```
26 & HG fit          ← noise + label, time on next line (B+)
3 > 8:00 AM-4:30 PM  ← noise + time on same line (A+)
28 @» 1.00 PM-9:30   ← noise + OCR'd period separator (A+)
```

**State machine variables**: `afterDayName`, `pendingDay`, `pendingDayName`, `pendingLabel`, `skipNextShift`, `currentWeek`

**Week windows** (`WeekWindow`): the parser tracks one `currentWeek` - the seven
dates of the week a shift belongs to, keyed by day-of-month. Built two ways:

- **From a visible week header** (`certain: true`): the header pins the week
  exactly. Cross-month ranges like `May 31 - June 06` fall out of plain date
  arithmetic, which replaced the old `weekSpan` start-day comparison.
- **Inferred, when the header scrolled off** (`certain: false`): a screenshot
  usually starts mid-list, so the first visible shift often belongs to a week
  whose header is off-screen. The only month context left is the month dropdown,
  which shows the *selected* month and can lag the visible week (dropdown
  `September 2026` above a shift that is really Oct 3). `buildPreHeaderWindow()`
  scans ahead to the next week header and takes the seven days ending the day
  before it starts. A surviving day-of-week name vetoes an *inferred* week when
  the weekday disagrees - that means a week header went missing, not that the
  dropdown lagged. A visible header is never vetoed.

**OCR-mangled day numbers**: when the parsed day number is not one of the seven
days `currentWeek` covers, OCR mangled it - a dropped leading digit turns `21`
into `1`, or `24` into `4`. Seven consecutive dates contain each weekday exactly
once, so a surviving `Sat` line recovers the real date via `findDayByName()`.

**Year boundaries**: `resolveHeaderYear()` keeps a week header's year right when
the header and the dropdown straddle New Year (`December 2026` dropdown above a
`January 04 - 10` header resolves to 2027).

**Title priority**: `pendingLabel` (shift type label above the time) → last two slash-path segments below the time (e.g. `"Hardgoods - Action Sports"`)

**Filtered/skipped**: "Time Off Unpaid" entries, `[duration]` lines like `[7:30]`, UI chrome (Home/Inbox/Menu/Request)

**Time separator**: `TIME_RANGE_RE` accepts both `:` and `.` (e.g. `1.00 PM`) — OCR sometimes misreads colons as periods.

- Deduplication key: `date|startTime|endTime`
- ICS UIDs are `shift-YYYY-MM-DD@gearshift` for the first shift of a day and
  `shift-YYYY-MM-DD-<n>@gearshift` for later ones, where `<n>` is the shift's
  ordinal within that day (sorted by start time). Two properties this buys:
  same-day shifts don't collide onto one event, and editing a shift's *time*
  doesn't change its UID, so re-importing a correction updates the existing
  event rather than adding a second one. The first-of-day UID keeps the old
  bare-date form so events exported before v1.75.6 still update in place.

## Review Step Features
- **Per-device default title**: the "Default title for all shifts" box persists to `localStorage` (key `gearshift-default-title`). Typing into it applies to every shift and saves the value. It's auto-applied to all freshly extracted shifts in `page.tsx handleOcrComplete` — done once at extraction time so later per-shift edits aren't clobbered. The box is pre-filled from `localStorage` on mount (`ShiftTable.tsx`); clearing it removes the default and keeps the parsed titles. Per-device/per-browser by nature — not synced across a user's own devices.
- **Per-shift screenshot viewer**: photo icon on each card opens a lightbox showing the source screenshot (`imageIndex` on `Shift` tracks which image it came from)
- **Bug report button**: red pill button opens a Formspree modal — user describes the issue, schedule data attaches automatically

## iOS-Specific Behavior
- Detected via `userAgent` or `platform === "MacIntel" && maxTouchPoints > 1`
- Button label changes to "Add to Calendar" (generic) instead of "Download .ics File"
- `downloadIcs()` uses a hidden form POST to `/api/ics` instead of a blob URL — Safari then offers to open the file in Calendar

## Google Calendar Flow
No API or OAuth. Uses `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...` URLs. User saves each event manually; the app provides a "Next Shift" button to step through them sequentially.

## Bug Reporting
Formspree endpoint: `https://formspree.io/f/meelrayd`
Reports include user's description + full schedule data + app version. Received reports can be pasted into Claude to debug parser issues.

## Version
v1.75.9 — displayed in footer via `process.env.APP_VERSION`.
**Note:** `APP_VERSION` is baked in at build time — restart dev server after bumping `package.json`.

## Dev Commands
```bash
npm run dev        # start dev server (localhost:3000, auto-increments if busy)
npm run build
npm run lint
npm test           # parser regression suite (vitest, single run)
npm run test:watch # same, re-runs on save
```

## Testing
`src/lib/parser.test.ts` is the only test file, and the parser is the only thing
worth testing: everything else is thin UI over it. The parser's rules interact,
so a fix for one screenshot format can silently break another — the suite exists
to catch exactly that.

**Workflow for a bug report:** a Formspree report contains the exact OCR text
that broke. Paste it into a new `it(...)` with the dates the screenshot really
shows, run `npm test`, and confirm it fails *before* fixing anything. Then fix the
parser until the new case passes and every existing case still does.

Run `npm test` before pushing. Vercel does not run it.
