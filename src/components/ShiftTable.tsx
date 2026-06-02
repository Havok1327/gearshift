"use client";

import { useEffect, useState } from "react";
import { Shift } from "@/types";

interface ShiftTableProps {
  shifts: Shift[];
  onShiftsChange: (shifts: Shift[]) => void;
  rawText: string;
  onViewScreenshot?: (index: number) => void;
}

const DEFAULT_TITLE_KEY = "gearshift-default-title";

let nextId = 1000;

export default function ShiftTable({
  shifts,
  onShiftsChange,
  rawText,
  onViewScreenshot,
}: ShiftTableProps) {
  // Per-device default title, persisted in localStorage. Loaded after mount
  // (localStorage isn't available during SSR).
  const [defaultTitle, setDefaultTitle] = useState("");
  useEffect(() => {
    setDefaultTitle(localStorage.getItem(DEFAULT_TITLE_KEY) ?? "");
  }, []);

  const handleDefaultTitleChange = (val: string) => {
    setDefaultTitle(val);
    if (val.trim()) {
      localStorage.setItem(DEFAULT_TITLE_KEY, val);
      onShiftsChange(shifts.map((s) => ({ ...s, title: val })));
    } else {
      localStorage.removeItem(DEFAULT_TITLE_KEY);
    }
  };

  const updateShift = (id: string, field: keyof Shift, value: string) => {
    onShiftsChange(
      shifts.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const removeShift = (id: string) => {
    onShiftsChange(shifts.filter((s) => s.id !== id));
  };

  const addShift = () => {
    onShiftsChange([
      ...shifts,
      {
        id: String(nextId++),
        date: "",
        startTime: "09:00",
        endTime: "17:00",
        title: "Work Shift",
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800">
          Extracted Shifts ({shifts.length})
        </h3>
        <button
          onClick={addShift}
          className="px-3 py-2 text-sm bg-green-500 text-white rounded-lg active:bg-green-600 transition-colors min-h-[44px]"
        >
          + Add Shift
        </button>
      </div>

      {/* Default title for all shifts — persisted per device */}
      {shifts.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Default title for all shifts
            <span className="font-normal text-gray-400"> — saved on this device</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={defaultTitle}
              placeholder="e.g. Shift @ REI"
              onChange={(e) => handleDefaultTitleChange(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {defaultTitle.trim()
              ? "Applied to every shift and remembered next time on this device."
              : "Leave blank to keep the individual titles from your schedule."}
          </p>
        </div>
      )}

      {shifts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No shifts were extracted from the image.</p>
          <p className="text-sm mt-1">
            Try uploading a clearer screenshot, or add shifts manually.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift, index) => (
            <div
              key={shift.id}
              className="border border-gray-200 rounded-xl p-3 sm:p-4 space-y-3"
            >
              {/* Card header with shift number and delete */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Shift {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  {onViewScreenshot && shift.imageIndex !== undefined && (
                    <button
                      onClick={() => onViewScreenshot(shift.imageIndex!)}
                      className="text-gray-400 active:text-blue-500 transition-colors p-1 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="View source screenshot"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => removeShift(shift.id)}
                    className="text-red-400 active:text-red-600 transition-colors p-1 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Remove shift"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
                </div>
              </div>

              {/* Date — full width */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={shift.date}
                  onChange={(e) => updateShift(shift.id, "date", e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              {/* Start / End times — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Start
                  </label>
                  <input
                    type="time"
                    value={shift.startTime}
                    onChange={(e) =>
                      updateShift(shift.id, "startTime", e.target.value)
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    End
                  </label>
                  <input
                    type="time"
                    value={shift.endTime}
                    onChange={(e) =>
                      updateShift(shift.id, "endTime", e.target.value)
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={shift.title}
                  onChange={(e) =>
                    updateShift(shift.id, "title", e.target.value)
                  }
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="mt-4">
        <summary className="text-sm text-gray-500 cursor-pointer active:text-gray-700 py-2">
          Show raw OCR text
        </summary>
        <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
          {rawText}
        </pre>
      </details>
    </div>
  );
}
