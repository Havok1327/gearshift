"use client";

import { useState } from "react";
import { Shift } from "@/types";
import { generateIcs, downloadIcs } from "@/lib/ics-generator";

interface ExportOptionsProps {
  shifts: Shift[];
}

function buildGoogleCalendarUrl(shift: Shift): string {
  const start = shift.date.replace(/-/g, "") + "T" + shift.startTime.replace(":", "") + "00";
  const end = shift.date.replace(/-/g, "") + "T" + shift.endTime.replace(":", "") + "00";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: shift.title || "Work Shift",
    dates: `${start}/${end}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function ExportOptions({ shifts }: ExportOptionsProps) {
  const [currentShiftIndex, setCurrentShiftIndex] = useState(-1);

  const validShifts = shifts.filter((s) => s.date && s.startTime && s.endTime);

  const handleDownloadIcs = () => {
    if (validShifts.length === 0) {
      alert("No valid shifts to export. Please ensure all shifts have dates and times.");
      return;
    }
    try {
      const icsContent = generateIcs(validShifts);
      downloadIcs(icsContent);
    } catch (e) {
      alert(`Failed to generate calendar file: ${(e as Error).message}`);
    }
  };

  const handleGoogleSync = () => {
    if (validShifts.length === 0) {
      alert("No valid shifts to export. Please ensure all shifts have dates and times.");
      return;
    }
    // Start stepping through shifts
    setCurrentShiftIndex(0);
    window.open(buildGoogleCalendarUrl(validShifts[0]), "_blank");
  };

  const handleNextShift = () => {
    const nextIndex = currentShiftIndex + 1;
    if (nextIndex < validShifts.length) {
      setCurrentShiftIndex(nextIndex);
      window.open(buildGoogleCalendarUrl(validShifts[nextIndex]), "_blank");
    } else {
      setCurrentShiftIndex(-1);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base sm:text-lg font-semibold text-gray-800">Export Options</h3>

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={handleDownloadIcs}
          className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-500 text-white rounded-xl active:bg-blue-600 transition-colors font-medium min-h-[56px]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Download .ics File
        </button>

        <button
          onClick={handleGoogleSync}
          className="flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-gray-300 text-gray-700 rounded-xl active:border-gray-400 active:bg-gray-50 transition-colors font-medium min-h-[56px]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Add to Google Calendar
        </button>
      </div>

      {/* Step-through UI when adding shifts one at a time */}
      {currentShiftIndex >= 0 && currentShiftIndex < validShifts.length && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <p className="text-sm font-medium text-blue-800">
            Shift {currentShiftIndex + 1} of {validShifts.length}
          </p>
          <p className="text-sm text-blue-700">
            Save the event in Google Calendar, then switch back to this tab to continue.
          </p>
          <button
            onClick={handleNextShift}
            className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg active:bg-blue-600 transition-colors font-medium min-h-[48px]"
          >
            {currentShiftIndex + 1 < validShifts.length
              ? `Next Shift (${currentShiftIndex + 2} of ${validShifts.length})`
              : "Done"}
          </button>
        </div>
      )}

      {currentShiftIndex >= validShifts.length && (
        <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm">
          All {validShifts.length} shifts added to Google Calendar!
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        The .ics file works with Apple Calendar, Outlook, or any calendar app.
        Google Calendar opens each shift for you to save — no sign-in needed.
      </p>
    </div>
  );
}
