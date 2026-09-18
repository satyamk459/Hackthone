import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

export const GEMINI_MODEL = "gemini-3.6-flash";

export const GEMINI_SYSTEM_INSTRUCTION =
  "You are ClaimWise AI, an insurance claims assistant. Reply in the same language as the user when answering later questions. Explain insurance policies, coverage, exclusions, claim eligibility, required documents, and next steps simply. Base conclusions on the uploaded documents, never guess, and clearly say when something cannot be determined. This is informational guidance, not a claim decision.";

const MAX_RETRIES = 3;

function isRetryableError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const status =
      (error as { status?: number }).status ??
      (error as { response?: { status?: number } }).response?.status;
    if (status === 503 || status === 429) return true;

    const message =
      (error as { message?: string }).message ?? String(error);
    if (/service unavailable|overloaded|high demand|resource exhausted|too many requests/i.test(message))
      return true;
  }
  return false;
}

/**
 * Call a Gemini request function with automatic retry + exponential backoff.
 * Retries up to MAX_RETRIES times on 503 / 429 / overload errors.
 */
export async function callGeminiWithRetry<T>(
  requestFn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (!isRetryableError(error) || attempt === retries - 1) {
        throw error;
      }
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      console.warn(
        `Gemini ${GEMINI_MODEL} attempt ${attempt + 1}/${retries} failed (retryable). Waiting ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error("Gemini retry loop ended unexpectedly.");
}

/**
 * Get a Gemini model instance configured with the ClaimWise system instruction.
 */
export function getGeminiModel(
  apiKey: string,
  systemInstruction: string = GEMINI_SYSTEM_INSTRUCTION
): GenerativeModel {
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
  });
}

/**
 * Convert Gemini errors into user-friendly responses.
 */
export function toUserFacingError(error: unknown): {
  success: false;
  code: string;
  message: string;
  status: number;
} {
  if (isRetryableError(error)) {
    return {
      success: false,
      code: "MODEL_BUSY",
      message:
        "AI analysis is temporarily busy. Your document is safely uploaded — you can retry.",
      status: 503,
    };
  }
  return {
    success: false,
    code: "ANALYSIS_FAILED",
    message:
      "We could not analyze this document right now. Your document is safely uploaded — please try again later.",
    status: 502,
  };
}
