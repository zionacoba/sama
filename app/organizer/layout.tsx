import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const headersList = await headers();
  const pathname = headersList.get("x-invoke-path") || "";

  if (!pathname.includes("/organizer/apply")) {
    if (!organizer || organizer.status !== "approved") {
      redirect("/");
    }
  }

  return <>{children}</>;
}
