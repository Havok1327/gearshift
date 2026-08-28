"use client";

import { useState, useEffect, useRef } from "react";
import { processImage } from "@/lib/ocr";
import { parseScheduleText, deduplicateShifts } from "@/lib/parser";
import { Shift } from "@/types";

interface OcrProcessorProps {
  imageDataUrls: string[];
  /**
   * Index of the first of these images within the caller's full image list.
   * Keeps `imageIndex` on each shift pointing at the right screenshot when
   * only a newly added batch is processed.
   */
  indexOffset?: number;
  onComplete: (shifts: Shift[], rawText: string, warnings: string[]) => void;
  onError: (error: string) => void;
}

export default function OcrProcessor({
  imageDataUrls,
  indexOffset = 0,
  onComplete,
  onError,
}: OcrProcessorProps) {
  const [progress, setProgress] = useState(0);
  const [currentImage, setCurrentImage] = useState(0);
  const [status, setStatus] = useState("Initializing OCR engine...");

  const totalImages = imageDataUrls.length;

  // Held in refs so a parent re-render that changes callback identity can't
  // restart an OCR run that's already in flight.
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const allTexts: string[] = [];
        const warnings: string[] = [];

        for (let i = 0; i < imageDataUrls.length; i++) {
          if (cancelled) return;

          setCurrentImage(i);
          setStatus(
            totalImages > 1
              ? `Processing image ${i + 1} of ${totalImages}...`
              : "Processing image..."
          );

          try {
            const result = await processImage(imageDataUrls[i], (p) => {
              if (!cancelled) {
                const base = (i / totalImages) * 100;
                const segment = (1 / totalImages) * 100;
                setProgress(Math.round(base + (p / 100) * segment));
              }
            });

            allTexts.push(result.text);

            // Check if this image produced useful schedule text
            const imageShifts = parseScheduleText(result.text);
            if (imageShifts.length === 0) {
              const label = totalImages > 1 ? `Image ${i + 1}` : "The image";
              if (result.confidence < 30) {
                warnings.push(`${label} couldn't be read. It may not be a schedule screenshot.`);
              } else {
                warnings.push(`${label} didn't contain any recognizable shifts.`);
              }
            }
          } catch {
            const label = totalImages > 1 ? `Image ${i + 1}` : "The image";
            warnings.push(`${label} failed to process and was skipped.`);
          }
        }

        if (cancelled) return;

        setStatus("Parsing schedule data...");
        setProgress(100);

        const combinedText = allTexts.join("\n");
        const allShifts = allTexts.flatMap((text, batchIndex) =>
          parseScheduleText(text).map((s) => ({
            ...s,
            imageIndex: indexOffset + batchIndex,
          }))
        );
        const shifts = deduplicateShifts(allShifts);
        shifts.sort((a, b) => {
          const cmp = a.date.localeCompare(b.date);
          return cmp !== 0 ? cmp : a.startTime.localeCompare(b.startTime);
        });

        // Whether an empty result is fatal depends on shifts the caller may
        // already hold from earlier batches, so report and let it decide.
        onCompleteRef.current(shifts, combinedText, warnings);
      } catch (e) {
        if (!cancelled) {
          onErrorRef.current((e as Error).message);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [imageDataUrls, totalImages, indexOffset]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
        <span className="text-gray-700">{status}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-500 text-center">
        {totalImages > 1 && (
          <span className="block">
            Image {currentImage + 1} of {totalImages}
          </span>
        )}
        {progress}% complete
      </p>
    </div>
  );
}
