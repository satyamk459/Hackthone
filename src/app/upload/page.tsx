import { redirect } from "next/navigation";
import { UploadDocument } from "@/components/UploadDocument";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: policies } = await supabase.from("policies").select("id, policy_name, insurer_name").eq("user_id", auth.user.id).order("created_at", { ascending: false });
  return <UploadDocument policies={policies ?? []} onboarding={!policies?.length} />;
}
