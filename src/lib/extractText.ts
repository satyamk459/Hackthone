/**
 * Text extraction utilities for text-native documents.
 * PDFs and images are sent to Gemini directly; DOCX needs local text extraction.
 */

export interface ExtractionResult {
  text: string;
  method: "pdf-parse" | "raw" | "docx-parse";
  error?: string;
  pageCount?: number;
}

async function extractTextFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default;
    const data = await pdfParse(buffer);
    const text = data.text || "";

    if (!text.trim()) {
      return {
        text: "",
        method: "pdf-parse",
        error: "PDF text extraction returned empty result.",
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
    console.warn("PDF text extraction failed", {
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

async function extractTextFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || "";

    if (!text.trim()) {
      return {
        text: "",
        method: "docx-parse",
        error: "DOCX text extraction returned empty result.",
      };
    }

    return {
      text,
      method: "docx-parse",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown DOCX extraction error";
    console.warn("DOCX text extraction failed", {
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

  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPdf(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    return extractTextFromDocx(buffer);
  }

  return {
    text: "",
    method: "raw",
    error: "Text extraction is not supported for this file type.",
  };
}
