import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "You must be signed in to upload a policy." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName : "uploaded-policy";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
  const userId = authData.user.id;
  const existingPolicyId = typeof body?.policyId === "string" ? body.policyId : "";
  const requestedVersionId = typeof body?.versionId === "string" ? body.versionId : "";

  if (existingPolicyId) {
    const { data: existingPolicy } = await supabase.from("policies").select("id").eq("id", existingPolicyId).eq("user_id", userId).single();
    const versionQuery = supabase.from("policy_versions").select("id").eq("policy_id", existingPolicyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: existingVersion } = requestedVersionId ? await supabase.from("policy_versions").select("id").eq("id", requestedVersionId).eq("policy_id", existingPolicyId).single() : await versionQuery;
    if (!existingPolicy || !existingVersion) return NextResponse.json({ error: "The selected policy could not be found." }, { status: 404 });
    const storagePath = `${userId}/${existingPolicyId}/${existingVersion.id}/${safeFileName(fileName)}`;
    return NextResponse.json({ policyId: existingPolicyId, versionId: existingVersion.id, storagePath, fileName, mimeType, fileSize, isNewPolicy: false }, { status: 201 });
  }
  const policyName = fileName.replace(/\.(pdf|jpe?g|png|docx)$/i, "") || "Uploaded policy";

  const { data: policy, error: policyError } = await supabase
    .from("policies")
    .insert({ user_id: userId, policy_name: policyName, status: "queued" })
    .select("id")
    .single();
  if (policyError || !policy) return NextResponse.json({ error: "We could not create the policy workspace." }, { status: 500 });

  const { data: version, error: versionError } = await supabase
    .from("policy_versions")
    .insert({ policy_id: policy.id, version_label: "Version 1" })
    .select("id")
    .single();
  if (versionError || !version) {
    await supabase.from("policies").delete().eq("id", policy.id);
    return NextResponse.json({ error: "We could not create the policy version." }, { status: 500 });
  }

  const storagePath = `${userId}/${policy.id}/${version.id}/${safeFileName(fileName)}`;
  return NextResponse.json({ policyId: policy.id, versionId: version.id, storagePath, fileName, mimeType, fileSize, isNewPolicy: true }, { status: 201 });
}