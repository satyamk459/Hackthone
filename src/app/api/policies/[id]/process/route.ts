import { createSupabaseServerClient } from "@/lib/supabase/server";
import { callGeminiWithRetry, getGeminiModel, GEMINI_MODEL, toUserFacingError } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { extractTextFromDocument } from "@/lib/extractText";

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

    // Extract text from each document with detailed logging
    const extractedContents: string[] = [];
    for (const item of document) {
      console.log("Processing document for analysis", {
        policyId,
        documentId: item.id,
        fileName: item.file_name,
        mimeType: item.mime_type,
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

      // Extract text from the document
      const extraction = await extractTextFromDocument(buffer, item.mime_type || "application/pdf", item.file_name);

      console.log("Text extraction completed", {
        policyId,
        documentId: item.id,
        fileName: item.file_name,
        method: extraction.method,
        textLength: extraction.text.length,
        error: extraction.error,
      });

      if (extraction.text.trim()) {
        extractedContents.push(`=== Document: ${item.file_name} ===\n${extraction.text}`);
      } else if (extraction.error) {
        console.warn("Text extraction failed, document may be image-based or unreadable", {
          policyId,
          documentId: item.id,
          fileName: item.file_name,
          error: extraction.error,
        });
        // Still send to Gemini for vision-based analysis
        extractedContents.push(`=== Document: ${item.file_name} ===\n[Document could not be extracted as text - see attached image]`);
      }
    }

    if (extractedContents.length === 0) {
      console.error("No text could be extracted from any document", { policyId });
      throw new Error("Could not extract readable text from any uploaded document. Please try a different format or quality.");
    }

    console.log("Sending extracted content to Gemini", {
      policyId,
      documentCount: document.length,
      totalTextLength: extractedContents.join("\n\n").length,
    });

    const model = getGeminiModel(apiKey, undefined, { json: true });

    // Retry with exponential backoff on 503/429
    const result = await callGeminiWithRetry(() =>
      model.generateContent([analysisPrompt, ...extractedContents])
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
