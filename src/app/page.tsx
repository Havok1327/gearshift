"use client";

import { useState, useCallback } from "react";
import ImageUpload from "@/components/ImageUpload";
import OcrProcessor from "@/components/OcrProcessor";
import ShiftTable from "@/components/ShiftTable";
import ExportOptions from "@/components/ExportOptions";
import { Shift, WorkflowStep } from "@/types";

export default function Home() {
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  const handleImagesSelected = useCallback((dataUrls: string[]) => {
    setImageDataUrls(dataUrls);
    setError(null);
    setStep("processing");
  }, []);

  const handleOcrComplete = useCallback((extractedShifts: Shift[], text: string, ocrWarnings: string[]) => {
    setShifts(extractedShifts);
    setRawText(text);
    setWarnings(ocrWarnings);
    setStep("review");
  }, []);

  const handleOcrError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    setImageDataUrls([]);
    setStep("upload");
  }, []);

  const handleAddMore = useCallback(() => {
    setStep("upload");
  }, []);

  const handleReset = () => {
    setStep("upload");
    setImageDataUrls([]);
    setShifts([]);
    setRawText("");
    setError(null);
    setWarnings([]);
    setReminderDismissed(false);
  };

  const steps: { key: WorkflowStep; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "processing", label: "Process" },
    { key: "review", label: "Review" },
    { key: "export", label: "Export" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-3 py-4 sm:px-4 sm:py-8">
        {/* Header */}
        <div className="text-center mb-5 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            GearShift
          </h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            Upload your schedule screenshots and export to your calendar
          </p>
        </div>

        {/* Progress Steps — compact horizontal bar on mobile */}
        <div className="flex items-center justify-between mb-5 sm:mb-8 px-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 ${
                    i <= currentStepIndex
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`mt-1 text-xs ${
                    i <= currentStepIndex
                      ? "text-blue-600 font-medium"
                      : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 sm:mx-3 mt-[-1rem] ${
                    i < currentStepIndex ? "bg-blue-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
              {error}
            </div>
          )}

          {step === "upload" && (
            <ImageUpload
              onImagesSelected={handleImagesSelected}
              existingCount={imageDataUrls.length}
            />
          )}

          {step === "processing" && imageDataUrls.length > 0 && (
            <OcrProcessor
              imageDataUrls={imageDataUrls}
              onComplete={handleOcrComplete}
              onError={handleOcrError}
            />
          )}

          {step === "review" && (
            <div className="space-y-4 sm:space-y-6">
              {warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200 text-sm space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
              <ShiftTable
                shifts={shifts}
                onShiftsChange={setShifts}
                rawText={rawText}
              />
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-3 sm:py-2 text-sm text-gray-600 active:text-gray-800 transition-colors rounded-lg"
                >
                  Start Over
                </button>
                <button
                  onClick={handleAddMore}
                  className="px-4 py-3 sm:py-2 text-sm text-gray-600 border border-gray-300 rounded-lg active:bg-gray-50 transition-colors"
                >
                  Add More Images
                </button>
                <button
                  onClick={() => setStep("export")}
                  disabled={shifts.length === 0}
                  className="px-6 py-3 sm:py-2 bg-blue-500 text-white rounded-lg active:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Continue to Export
                </button>
              </div>
            </div>
          )}

          {step === "export" && (
            <div className="space-y-4 sm:space-y-6">
              <ExportOptions shifts={shifts} />

              {/* Screenshot cleanup reminder */}
              {imageDataUrls.length > 0 && !reminderDismissed && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-amber-800">
                      You can now delete {imageDataUrls.length === 1 ? "this screenshot" : `these ${imageDataUrls.length} screenshots`} from your Photos app.
                    </p>
                    <button
                      onClick={() => setReminderDismissed(true)}
                      className="shrink-0 text-amber-400 active:text-amber-600 transition-colors p-1 -m-1"
                      aria-label="Dismiss reminder"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {imageDataUrls.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt={`Screenshot ${i + 1}`}
                        className="h-20 w-auto rounded-lg border border-amber-200 shrink-0"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-3 sm:py-2 text-sm text-gray-600 active:text-gray-800 transition-colors rounded-lg"
                >
                  Start Over
                </button>
                <button
                  onClick={() => setStep("review")}
                  className="px-4 py-3 sm:py-2 text-sm text-gray-600 border border-gray-300 rounded-lg active:bg-gray-50 transition-colors"
                >
                  Back to Edit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* How to Use — collapsible help section */}
        <details className="mt-4 sm:mt-6 bg-white rounded-2xl shadow-sm border border-gray-200">
          <summary className="px-4 sm:px-6 py-3 sm:py-4 cursor-pointer text-sm sm:text-base font-medium text-gray-700 hover:text-gray-900 transition-colors select-none">
            How to Use
          </summary>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 text-sm text-gray-600 space-y-3">
            <ol className="list-decimal list-inside space-y-2">
              <li>
                <strong className="text-gray-700">Take a screenshot</strong> — Open your scheduling app, go to the <strong>day view</strong>, and take screenshots of your upcoming shifts. You can upload multiple screenshots if your schedule spans several weeks. Don&apos;t worry about overlap — duplicate shifts are automatically removed.
                <img
                  src="/example-schedule.jpg"
                  alt="Example schedule screenshot showing day view with shifts"
                  className="mt-2 rounded-lg border border-gray-200 max-w-[280px] w-full"
                />
              </li>
              <li>
                <strong className="text-gray-700">Upload</strong> — Tap the upload area or drag-and-drop your screenshot images. You can select multiple at once or add more later.
              </li>
              <li>
                <strong className="text-gray-700">Review</strong> — Check the extracted shifts. Edit dates, times, or titles if needed. Use the bulk title field to rename all shifts at once. Duplicates from overlapping screenshots are automatically removed.
              </li>
              <li>
                <strong className="text-gray-700">Export</strong> — Choose your method:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                  <li><strong>Download .ics</strong> — Works with Apple Calendar, Outlook, and Google Calendar (import). On iPhone/iPad, use Safari for best results.</li>
                  <li><strong>Add to Google Calendar</strong> — Opens each shift one by one. Save each event, then tap &ldquo;Next Shift.&rdquo;</li>
                </ul>
              </li>
            </ol>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                <strong className="text-gray-600">Note:</strong> If you drop a shift or swap shifts after exporting, you&apos;ll need to manually delete the old event from your calendar.
              </p>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                <strong className="text-gray-600">Tips:</strong> Use clear, zoomed-in screenshots for best OCR results. Safari is recommended on iOS devices.
              </p>
            </div>
          </div>
        </details>

        <p className="mt-4 sm:mt-6 text-center text-xs text-gray-400">
          All processing happens in your browser. No data is sent to any server.
        </p>
        <p className="mt-2 text-center text-xs text-gray-400">
          Results may not be 100% accurate. Always verify your shifts against your official schedule. We are not responsible for missed or incorrect shifts.
        </p>
      </div>
    </main>
  );
}
