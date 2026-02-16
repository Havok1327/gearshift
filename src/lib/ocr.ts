import Tesseract from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
}

export async function processImage(
  imageDataUrl: string,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  const result = await Tesseract.recognize(imageDataUrl, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}
