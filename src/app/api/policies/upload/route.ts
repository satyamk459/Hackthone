import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_UPLOAD_SIZE_BYTES, validatePolicyFile } from "@/lib/upload";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("policies")
    .select("id, insurer_name, policy_name, policy_number, policy_type, status, created_at")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Policies could not be loaded." }, { status: 500 });
  return NextResponse.json({ policies: data ?? [] });
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "You must be signed in to upload a policy." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a PDF, JPG, PNG, or DOCX file to upload." }, { status: 400 });
  }

  const validationError = validatePolicyFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "This PDF is larger than the 30 MB limit." }, { status: 413 });
  }

  const userId = authData.user.id;
  const policyName = file.name.replace(/\.pdf$/i, "") || "Uploaded policy";
  const { data: policy, error: policyError } = await supabase
    .from("policies")
    .insert({ user_id: userId, policy_name: policyName, status: "queued" })
    .select("id")
    .single();

  if (policyError || !policy) {
    return NextResponse.json({ error: "We could not create the policy workspace." }, { status: 500 });
  }

  const { data: version, error: versionError } = await supabase
    .from("policy_versions")
    .insert({ policy_id: policy.id, version_label: "Version 1" })
    .select("id")
    .single();

  if (versionError || !version) {
    await supabase.from("policies").delete().eq("id", policy.id);
    return NextResponse.json({ error: "We could not create the policy version." }, { status: 500 });
  }

  const storagePath = `${userId}/${policy.id}/${version.id}/${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("insurance-documents")
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadError) {
    await supabase.from("policy_versions").delete().eq("id", version.id);
    await supabase.from("policies").delete().eq("id", policy.id);
    return NextResponse.json({ error: "We could not store this PDF securely." }, { status: 500 });
  }

  const { error: documentError } = await supabase.from("policy_documents").insert({
    policy_id: policy.id,
    version_id: version.id,
    user_id: userId,
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || "application/pdf",
    file_size: file.size,
    processing_status: "queued",
  });

  if (documentError) {
    await supabase.storage.from("insurance-documents").remove([storagePath]);
    await supabase.from("policy_versions").delete().eq("id", version.id);
    await supabase.from("policies").delete().eq("id", policy.id);
    return NextResponse.json({ error: "We could not register this PDF for processing." }, { status: 500 });
  }

  await supabase.from("activity_history").insert({
    user_id: userId,
    policy_id: policy.id,
    event_type: "policy_uploaded",
    event_data: { file_name: file.name, file_size: file.size },
  });

  return NextResponse.json({ policyId: policy.id, versionId: version.id, fileName: file.name, status: "queued" }, { status: 201 });
}
