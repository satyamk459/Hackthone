/**
 * Text extraction utilities for PDFs, images, and DOCX files.
 * Handles OCR fallback and error logging.
 */

import * as Tesseract from "tesseract.js";

export interface ExtractionResult {
  text: string;
  method: "pdf-parse" | "ocr" | "raw" | "docx-parse";
  error?: string;
  pageCount?: number;
}

/**
 * Extract text from a PDF buffer
 */
async function extractTextFromPdf(
  buffer: Buffer
): Promise<ExtractionResult> {
  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default;
    const data = await pdfParse(buffer);
    const text = data.text || "";
    if (!text.trim()) {
      return {
        text: "",
        method: "pdf-parse",
        error: "PDF text extraction returned empty result — OCR may be needed",
        pageCount: data.numpages,
      };
    }
    return {
      text,
      method: "pdf-parse",
      pageCount: data.numpages,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown PDF extraction error";
    console.warn("PDF text extraction failed; will attempt OCR fallback", {
      method: "pdf-parse",
      error: message,
    });
    return {
      text: "",
      method: "pdf-parse",
      error: message,
    };
  }
}

/**
 * Extract text from an image using Tesseract OCR
 */
async function extractTextFromImage(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  try {
    const result = await Tesseract.recognize(buffer, "eng", {
      logger: (message: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          "status" in message &&
          "progress" in message &&
          message.status === "recognizing text" &&
          typeof message.progress === "number"
        ) {
          console.log(`OCR progress: ${Math.round(message.progress * 100)}%`);
        }
      },
    });

    const text = result.data.text || "";
    if (!text.trim()) {
      return {
        text: "",
        method: "ocr",
        error: "OCR returned empty result — document may be unreadable",
      };
    }

    return {
      text,
      method: "ocr",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown OCR error";
    console.error("Image OCR extraction failed", {
      method: "ocr",
      mimeType,
      error: message,
    });
    return {
      text: "",
      method: "ocr",
      error: message,
    };
  }
}

/**
 * Extract text from a DOCX file
 */
async function extractTextFromDocx(
  buffer: Buffer
): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || "";
    if (!text.trim()) {
      return {
        text: "",
        method: "docx-parse",
        error: "DOCX text extraction returned empty result",
      };
    }
    return {
      text,
      method: "docx-parse",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown DOCX extraction error";
    console.warn("DOCX text extraction failed; will attempt OCR fallback", {
      method: "docx-parse",
      error: message,
    });
    return {
      text: "",
      method: "docx-parse",
      error: message,
    };
  }
}

/**
 * Main extraction function that handles all file types
 * Falls back to OCR if text extraction fails
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractionResult> {
  console.log("Starting document text extraction", {
    mimeType,
    fileName,
    bufferSize: buffer.length,
  });

  // PDF extraction
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const result = await extractTextFromPdf(buffer);
    if (result.text.trim()) {
      console.log("PDF extraction succeeded", {
        method: result.method,
        textLength: result.text.length,
        pageCount: result.pageCount,
      });
      return result;
    }
    // Fall through to OCR if PDF extraction failed or returned empty
    console.warn("PDF extraction empty/failed; attempting OCR fallback");
  }

  // DOCX extraction
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    const result = await extractTextFromDocx(buffer);
    if (result.text.trim()) {
      console.log("DOCX extraction succeeded", {
        method: result.method,
        textLength: result.text.length,
      });
      return result;
    }
    // Fall through to OCR if DOCX extraction failed
    console.warn("DOCX extraction empty/failed; attempting OCR fallback");
  }

  // Image extraction (JPG/PNG) or OCR fallback
  if (
    mimeType?.startsWith("image/") ||
    fileName.toLowerCase().match(/\.(jpg|jpeg|png)$/i)
  ) {
    console.log("Starting image OCR extraction", { mimeType, fileName });
    const result = await extractTextFromImage(buffer, mimeType);
    if (result.text.trim()) {
      console.log("Image OCR extraction succeeded", {
        method: result.method,
        textLength: result.text.length,
      });
      return result;
    }
    return result;
  }

  // Fallback: Try OCR for any unrecognized format
  console.warn("Unrecognized file type; attempting OCR fallback", {
    mimeType,
    fileName,
  });
  return await extractTextFromImage(buffer, mimeType);
}
