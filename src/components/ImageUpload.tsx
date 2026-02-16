"use client";

import { useCallback, useState, useRef } from "react";

interface ImageUploadProps {
  onImagesSelected: (dataUrls: string[]) => void;
  existingCount?: number;
}

export default function ImageUpload({
  onImagesSelected,
  existingCount = 0,
}: ImageUploadProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      alert("Please upload image files (PNG, JPG, or WEBP)");
      return;
    }

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreviews((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) addFiles(droppedFiles);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length > 0) addFiles(selected);
      e.target.value = "";
    },
    [addFiles]
  );

  const removeFile = useCallback((index: number) => {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    if (previews.length > 0) {
      onImagesSelected(previews);
    }
  }, [previews, onImagesSelected]);

  const totalCount = existingCount + previews.length;

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-colors active:bg-blue-50 ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
        <div className="space-y-3">
          <svg
            className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-base sm:text-lg font-medium text-gray-700">
            {previews.length === 0
              ? "Tap to upload your schedule screenshots"
              : "Tap to add more screenshots"}
          </p>
          <p className="text-sm text-gray-500">
            PNG, JPG, or WEBP — select multiple images at once
          </p>
        </div>
      </div>

      {/* Thumbnail previews */}
      {previews.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {totalCount} {totalCount === 1 ? "image" : "images"} selected
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Screenshot ${existingCount + i + 1}`}
                  className="w-full aspect-[3/4] object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 active:opacity-100 transition-opacity"
                  aria-label={`Remove image ${i + 1}`}
                >
                  ×
                </button>
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {existingCount + i + 1}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSubmit();
            }}
            disabled={previews.length === 0}
            className="w-full py-3 sm:py-2 bg-blue-500 text-white rounded-lg active:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Process {totalCount} {totalCount === 1 ? "Image" : "Images"}
          </button>
        </div>
      )}
    </div>
  );
}
