import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_SYSTEM_INSTRUCTION = "You are ClaimWise AI, an insurance claims assistant. Reply in the same language as the user. Explain insurance policies, coverage, exclusions, claim eligibility, required documents, and next steps simply. If a question is vague, ask a clarifying question instead of guessing. Base policy-specific answers on the uploaded policy context and clearly say when information cannot be determined. This is informational guidance, not a claim decision.";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: policyId } = await params;
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const language = body?.language === "hindi" ? "Hindi" : body?.language === "english" ? "English" : "the same language as the user's question";
  if (!question) return NextResponse.json({ error: "Ask a question about this policy." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: policy } = await supabase.from("policies").select("id, policy_name, insurer_name").eq("id", policyId).eq("user_id", authData.user.id).single();
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  const [{ data: analysis }, { data: chunks }, { data: history }, { data: documents }] = await Promise.all([
    supabase.from("policy_analysis").select("analysis_json").eq("policy_id", policyId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("policy_chunks").select("page_number, section_title, content").eq("policy_id", policyId).order("page_number", { ascending: true }).limit(8),
    supabase.from("chat_sessions").select("id").eq("policy_id", policyId).eq("user_id", authData.user.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("policy_documents").select("file_name, processing_status").eq("policy_id", policyId).eq("user_id", authData.user.id).order("uploaded_at", { ascending: true }),
  ]);

  const context = chunks?.length ? chunks.map((chunk) => `[Page ${chunk.page_number ?? "unknown"}] ${chunk.section_title ?? "Policy section"}\n${chunk.content}`).join("\n\n") : JSON.stringify(analysis?.analysis_json ?? {});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini is not configured on the server." }, { status: 503 });

  const conversation = history?.id ? (await supabase.from("chat_messages").select("role, content").eq("session_id", history.id).order("created_at", { ascending: false }).limit(12)).data?.reverse() ?? [] : [];
  const prompt = `Response language preference: ${language}. Policy: ${policy.policy_name ?? "Unknown"} (${policy.insurer_name ?? "Unknown insurer"}).\n\nAssociated documents:\n${documents?.map((document) => `${document.file_name} (${document.processing_status})`).join("\n") ?? "No document list available"}\n\nUploaded policy context:\n${context}\n\nRecent conversation:\n${conversation.map((message) => `${message.role}: ${message.content}`).join("\n")}\n\nUser question: ${question}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let answer = "";
      try {
        const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: GEMINI_SYSTEM_INSTRUCTION });
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) { answer += text; controller.enqueue(encoder.encode(text)); }
        }
        if (!answer.trim()) throw new Error("Gemini did not return an answer.");
        const session = history ?? (await supabase.from("chat_sessions").insert({ policy_id: policyId, user_id: authData.user.id }).select("id").single()).data;
        if (!session) throw new Error("Chat session could not be created.");
        await supabase.from("chat_messages").insert([
          { session_id: session.id, user_id: authData.user.id, role: "user", content: question },
          { session_id: session.id, user_id: authData.user.id, role: "assistant", content: answer, sources: chunks?.map((chunk) => ({ page: chunk.page_number, section: chunk.section_title })) ?? [] },
        ]);
        await supabase.from("activity_history").insert({ user_id: authData.user.id, policy_id: policyId, event_type: "question_asked", event_data: { question, language } });
        controller.close();
      } catch (error) {
        console.error("Policy chat failed", { policyId, model: GEMINI_MODEL, message: error instanceof Error ? error.message : "Unknown error" });
        controller.enqueue(encoder.encode("\n\n[ClaimWise could not finish this answer. Please try again.]"));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}
