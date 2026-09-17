import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: policyId } = await params;
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Ask a question about this policy." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: policy } = await supabase.from("policies").select("id, policy_name, insurer_name").eq("id", policyId).eq("user_id", authData.user.id).single();
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  const [{ data: analysis }, { data: chunks }] = await Promise.all([
    supabase.from("policy_analysis").select("analysis_json").eq("policy_id", policyId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("policy_chunks").select("page_number, section_title, content").eq("policy_id", policyId).order("page_number", { ascending: true }).limit(8),
  ]);

  const context = chunks?.length ? chunks.map((chunk) => `[Page ${chunk.page_number ?? "unknown"}] ${chunk.section_title ?? "Policy section"}\n${chunk.content}`).join("\n\n") : JSON.stringify(analysis?.analysis_json ?? {});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini is not configured on the server." }, { status: 503 });

  const prompt = `You are ClaimWise, answering questions only about the user's selected insurance policy. Policy: ${policy.policy_name ?? "Unknown"} (${policy.insurer_name ?? "Unknown insurer"}).\n\nPolicy context:\n${context}\n\nQuestion: ${question}\n\nRules: use only the policy context, do not invent missing details, say you could not find sufficient information when needed, explain simply, and mention page numbers when present.`;

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const models = [...new Set([PRIMARY_GEMINI_MODEL, FALLBACK_GEMINI_MODEL])];
    let answer = "";
    let lastModelError: unknown;
    for (const modelName of models) {
      try {
        const result = await client.getGenerativeModel({ model: modelName }).generateContent(prompt);
        answer = result.response.text();
        if (answer.trim()) break;
      } catch (error) {
        lastModelError = error;
        console.warn("Gemini chat model attempt failed", { policyId, model: modelName, message: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    if (!answer.trim()) throw lastModelError instanceof Error ? lastModelError : new Error("Gemini did not return an answer.");
    const { data: existingSession } = await supabase.from("chat_sessions").select("id").eq("policy_id", policyId).eq("user_id", authData.user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const session = existingSession ?? (await supabase.from("chat_sessions").insert({ policy_id: policyId, user_id: authData.user.id }).select("id").single()).data;
    if (!session) throw new Error("Chat session could not be created.");

    await supabase.from("chat_messages").insert([
      { session_id: session.id, user_id: authData.user.id, role: "user", content: question },
      { session_id: session.id, user_id: authData.user.id, role: "assistant", content: answer, sources: chunks?.map((chunk) => ({ page: chunk.page_number, section: chunk.section_title })) ?? [] },
    ]);
    await supabase.from("activity_history").insert({ user_id: authData.user.id, policy_id: policyId, event_type: "question_asked", event_data: { question } });

    return NextResponse.json({ answer, sources: chunks?.map((chunk) => ({ page: chunk.page_number, section: chunk.section_title })) ?? [] });
  } catch (error) {
    console.error("Policy chat failed", { policyId, primaryModel: PRIMARY_GEMINI_MODEL, fallbackModel: FALLBACK_GEMINI_MODEL, message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "ClaimWise could not answer this question right now." }, { status: 502 });
  }
}
