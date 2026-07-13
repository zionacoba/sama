import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: organizer, error } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[organizer-layout] organizer fetch failed:", error);
    Sentry.captureException(error, {
      extra: { context: "organizer-layout-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") {
    redirect("/");
  }

  return <>{children}</>;
}
