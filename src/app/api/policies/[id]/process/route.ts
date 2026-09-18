import { createSupabaseServerClient } from "@/lib/supabase/server";
import { callGeminiWithRetry, getGeminiModel, GEMINI_MODEL, toUserFacingError } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { extractTextFromDocument } from "@/lib/extractText";
import type { Part } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const analysisPrompt = `You are ClaimWise, an insurance document analyst. Analyze only the uploaded insurance document. It may be a PDF, JPG, PNG, or DOCX file. Return valid JSON and no markdown with this exact shape:
{
  "insurance_category": "Car/Vehicle Insurance"|"Health Insurance"|"Life Insurance"|"Travel Insurance"|"Home Insurance"|"Term Insurance"|"Business Insurance"|"Other"|null,
  "insurance_category_confidence": "high"|"medium"|"low"|null,
  "claim_scenarios": [{"name": string, "when_it_applies": string, "page": number|null}],
  "coverage_summary": string|null,
  "provided_documents": [{"name": string, "evidence": string, "page": number|null}],
  "missing_claim_information": [{"name": string, "reason": string, "page": number|null}],
  "insurer_name": string|null,
  "policy_name": string|null,
  "policy_number": string|null,
  "policy_type": string|null,
  "sum_insured": string|null,
  "premium": string|null,
  "start_date": string|null,
  "end_date": string|null,
  "waiting_periods": [{"name": string, "value": string, "page": number|null}],
  "benefits": [{"name": string, "details": string, "page": number|null}],
  "exclusions": [{"name": string, "details": string, "page": number|null}],
  "limits": [{"name": string, "value": string, "page": number|null}],
  "claim_requirements": [{"name": string, "details": string, "page": number|null}],
  "important_clauses": [{"title": string, "summary": string, "page": number|null}],
  "recommended_actions": [string],
  "review_flags": [string],
  "next_steps": [string]
}
Use null or an empty array when the document does not contain a value. Never guess. Preserve page numbers when visible. Distinguish documents explicitly shown or mentioned in the uploaded document from documents that are merely commonly requested. For missing_claim_information, include only information or documents the policy explicitly requires or that are necessary to evaluate an identified claim scenario; if the policy does not say, state that it cannot be determined instead of inventing a requirement. Claim scenarios must be grounded in the policy wording. This is informational document extraction, not a claim decision.`;

function parseModelJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const cleaned = fenced?.[1] ?? trimmed;
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Gemini did not return valid JSON.");
  }
  return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
}

function normalizeGeminiMimeType(mimeType: string | null, fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) return "application/pdf";
  if (mimeType === "image/png" || lowerName.endsWith(".png")) return "image/png";
  if (mimeType === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return mimeType || "application/octet-stream";
}

function canSendInlineToGemini(mimeType: string) {
  return mimeType === "application/pdf" || mimeType === "image/png" || mimeType === "image/jpeg";
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: policyId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { data: document, error: documentError } = await supabase
    .from("policy_documents")
    .select("id, storage_path, version_id, mime_type, file_name")
    .eq("policy_id", policyId)
    .eq("user_id", authData.user.id)
    .order("uploaded_at", { ascending: true });

  if (documentError || !document?.length) {
    return NextResponse.json({ error: "Policy document not found." }, { status: 404 });
  }

  await supabase.from("policy_documents").update({ processing_status: "analyzing" }).eq("policy_id", policyId).eq("user_id", authData.user.id);
  await supabase.from("policies").update({ status: "analyzing" }).eq("id", policyId).eq("user_id", authData.user.id);

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set. Please add it to your .env file.");

    const contentParts: (string | Part)[] = [analysisPrompt];
    let usableDocumentCount = 0;

    for (const item of document) {
      const mimeType = normalizeGeminiMimeType(item.mime_type, item.file_name);
      console.log("Processing document for analysis", {
        policyId,
        documentId: item.id,
        fileName: item.file_name,
        mimeType,
        storagePath: item.storage_path,
      });

      // Download file from storage
      const { data: file, error: downloadError } = await supabase.storage.from("insurance-documents").download(item.storage_path);
      if (downloadError || !file) {
        console.error("Failed to download document from storage", {
          policyId,
          documentId: item.id,
          storagePath: item.storage_path,
          error: downloadError?.message || "File not found in storage",
        });
        throw new Error(`Failed to download document ${item.file_name}: ${downloadError?.message || "File not found"}`);
      }

      // Convert to buffer for text extraction
      const buffer = Buffer.from(await file.arrayBuffer());
      console.log("File downloaded successfully", {
        policyId,
        documentId: item.id,
        fileName: item.file_name,
        bufferSize: buffer.length,
      });

      if (canSendInlineToGemini(mimeType)) {
        contentParts.push(`=== Attached document: ${item.file_name} (${mimeType}) ===`);
        contentParts.push({
          inlineData: {
            mimeType,
            data: buffer.toString("base64"),
          },
        });
        usableDocumentCount += 1;
      }

      if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const extraction = await extractTextFromDocument(buffer, mimeType, item.file_name);

        console.log("Text extraction completed", {
          policyId,
          documentId: item.id,
          fileName: item.file_name,
          method: extraction.method,
          textLength: extraction.text.length,
          error: extraction.error,
        });

        if (!extraction.text.trim()) {
          throw new Error(`Could not extract readable text from DOCX file ${item.file_name}.`);
        }

        contentParts.push(`=== Extracted text from ${item.file_name} ===\n${extraction.text}`);
        usableDocumentCount += 1;
      }
    }

    if (usableDocumentCount === 0) {
      console.error("No usable document content could be prepared", { policyId });
      throw new Error("Could not extract readable text from any uploaded document. Please try a different format or quality.");
    }

    console.log("Sending document content to Gemini", {
      policyId,
      documentCount: document.length,
      contentPartCount: contentParts.length,
    });

    const model = getGeminiModel(apiKey, undefined, { json: true });

    // Retry with exponential backoff on 503/429
    const result = await callGeminiWithRetry(() =>
      model.generateContent(contentParts)
    );

    const rawResponse = result.response.text();
    console.log("Gemini response received", {
      policyId,
      responseLength: rawResponse.length,
    });

    const analysis = parseModelJson(rawResponse);

    const { error: analysisError } = await supabase.from("policy_analysis").upsert({
      policy_id: policyId,
      version_id: document[0].version_id,
      analysis_json: analysis,
      model_name: GEMINI_MODEL,
      analysis_version: "1",
    }, { onConflict: "policy_id,version_id" });
    if (analysisError) throw new Error("Analysis could not be saved.");

    await supabase.from("policy_documents").update({ processing_status: "completed", processed_at: new Date().toISOString(), processing_error: null }).eq("policy_id", policyId).eq("user_id", authData.user.id);
    await supabase.from("policies").update({ status: "completed", insurer_name: analysis.insurer_name, policy_name: analysis.policy_name ?? undefined, policy_number: analysis.policy_number, policy_type: analysis.policy_type }).eq("id", policyId).eq("user_id", authData.user.id);
    await supabase.from("activity_history").insert({ user_id: authData.user.id, policy_id: policyId, event_type: "analysis_completed", event_data: { model: GEMINI_MODEL } });

    console.log("Policy analysis completed successfully", {
      policyId,
      insurerName: analysis.insurer_name,
      policyName: analysis.policy_name,
      category: analysis.insurance_category,
    });

    return NextResponse.json({ status: "completed", analysis });
  } catch (error) {
    // Detailed error logging for debugging
    const err = error as {
      response?: { data?: unknown; error?: { message?: string } };
      status?: number;
    };
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    const apiError = err.response?.data || err.status || "";
    const apiMessage = err.response?.error?.message || "";

    console.error("========== POLICY ANALYSIS FAILED ==========", {
      policyId,
      documentIds: document?.map((item) => item.id),
      documentNames: document?.map((item) => item.file_name),
      model: GEMINI_MODEL,
      errorMessage: message,
      errorStack: stack,
      apiError: apiError,
      apiMessage: apiMessage,
      fullError: JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
    });
    console.error("=============================================");

    // Don't delete the uploaded document — keep it safe for retry
    // Set status to "needs_retry" instead of "failed" for retryable errors
    const userError = toUserFacingError(error);
    const retryable = userError.code === "MODEL_BUSY";
    const dbStatus = retryable ? "needs_retry" : "failed";

    await supabase.from("policy_documents").update({ processing_status: dbStatus, processing_error: message }).eq("policy_id", policyId).eq("user_id", authData.user.id);
    await supabase.from("policies").update({ status: dbStatus }).eq("id", policyId).eq("user_id", authData.user.id);

    return NextResponse.json(
      { error: userError.message, code: userError.code, retryable },
      { status: userError.status }
    );
  }
}
