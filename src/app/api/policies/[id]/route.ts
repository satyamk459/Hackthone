import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: policyId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: policy } = await supabase.from("policies").select("id").eq("id", policyId).eq("user_id", auth.user.id).single();
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  const { data: documents } = await supabase.from("policy_documents").select("storage_path").eq("policy_id", policyId).eq("user_id", auth.user.id);
  const storagePaths = documents?.map((document) => document.storage_path) ?? [];
  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage.from("insurance-documents").remove(storagePaths);
    if (storageError) return NextResponse.json({ error: "The policy files could not be removed." }, { status: 500 });
  }

  const { error } = await supabase.from("policies").delete().eq("id", policyId).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: "The policy could not be deleted." }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
