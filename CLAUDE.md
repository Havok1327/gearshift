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
    ShiftTable.tsx         # Editable shift cards + bulk title rename + raw OCR debug view + per-card screenshot viewer
    ExportOptions.tsx      # ICS download button + Google Calendar step-through UI
  lib/
    ocr.ts                 # Thin Tesseract.js wrapper → { text, confidence }
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

**State machine variables**: `afterDayName`, `pendingDay`, `pendingLabel`, `skipNextShift`

**Title priority**: `pendingLabel` (shift type label above the time) → last two slash-path segments below the time (e.g. `"Hardgoods - Action Sports"`)

**Filtered/skipped**: "Time Off Unpaid" entries, `[duration]` lines like `[7:30]`, UI chrome (Home/Inbox/Menu/Request)

**Time separator**: `TIME_RANGE_RE` accepts both `:` and `.` (e.g. `1.00 PM`) — OCR sometimes misreads colons as periods.

- Deduplication key: `date|startTime|endTime`
- ICS UIDs are stable (`shift-YYYY-MM-DD@gearshift`) so re-importing updates rather than duplicates

## Review Step Features
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
v1.75.0 — displayed in footer via `process.env.APP_VERSION`.
**Note:** `APP_VERSION` is baked in at build time — restart dev server after bumping `package.json`.

## Dev Commands
```bash
npm run dev    # start dev server (localhost:3000, auto-increments if busy)
npm run build
npm run lint
```
