import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_SYSTEM_INSTRUCTION = "You are ClaimWise AI, an insurance claims assistant. Reply in the same language as the user when answering later questions. Explain insurance policies, coverage, exclusions, claim eligibility, required documents, and next steps simply. Base conclusions on the uploaded documents, never guess, and clearly say when something cannot be determined. This is informational guidance, not a claim decision.";

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
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
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
    if (!apiKey) throw new Error("Gemini is not configured on the server.");

    const uploadedDocuments = [];
    for (const item of document) {
      const { data: file, error: downloadError } = await supabase.storage.from("insurance-documents").download(item.storage_path);
      if (downloadError || !file) throw new Error(`The stored document ${item.file_name} could not be read.`);
      uploadedDocuments.push({ inlineData: { mimeType: item.mime_type || "application/pdf", data: Buffer.from(await file.arrayBuffer()).toString("base64") } });
    }
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: GEMINI_SYSTEM_INSTRUCTION });
    const result = await model.generateContent([...uploadedDocuments, analysisPrompt]);
    const analysis = parseModelJson(result.response.text());

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

    return NextResponse.json({ status: "completed", analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The policy could not be analyzed.";
    console.error("Policy analysis failed", { policyId, documentIds: document?.map((item) => item.id), model: GEMINI_MODEL, message });
    await supabase.from("policy_documents").update({ processing_status: "failed", processing_error: message }).eq("policy_id", policyId).eq("user_id", authData.user.id);
    await supabase.from("policies").update({ status: "failed" }).eq("id", policyId).eq("user_id", authData.user.id);
    return NextResponse.json({ error: "We could not analyze this document. Check the uploaded file and try again." }, { status: 502 });
  }
}
