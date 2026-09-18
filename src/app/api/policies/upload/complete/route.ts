import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "You must be signed in to upload a policy." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const policyId = typeof body?.policyId === "string" ? body.policyId : "";
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "uploaded-policy";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
  const isNewPolicy = body?.isNewPolicy === true;
  const expectedPrefix = `${authData.user.id}/${policyId}/${versionId}/`;
  if (!policyId || !versionId || !storagePath.startsWith(expectedPrefix)) return NextResponse.json({ error: "The upload details are invalid." }, { status: 400 });

  const { data: policy } = await supabase.from("policies").select("id").eq("id", policyId).eq("user_id", authData.user.id).single();
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  const { error: documentError } = await supabase.from("policy_documents").insert({
    policy_id: policyId,
    version_id: versionId,
    user_id: authData.user.id,
    file_name: fileName,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: fileSize,
    processing_status: "queued",
  });
  if (documentError) {
    await supabase.storage.from("insurance-documents").remove([storagePath]);
    if (isNewPolicy) {
      await supabase.from("policy_versions").delete().eq("id", versionId);
      await supabase.from("policies").delete().eq("id", policyId);
    }
    return NextResponse.json({ error: "We could not register this policy document." }, { status: 500 });
  }

  await supabase.from("activity_history").insert({
    user_id: authData.user.id,
    policy_id: policyId,
    event_type: "policy_uploaded",
    event_data: { file_name: fileName, file_size: fileSize },
  });
  return NextResponse.json({ policyId, versionId, fileName, status: "queued" }, { status: 201 });
}