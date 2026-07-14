"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("[sign-out] signOut failed:", error);
    Sentry.captureException(error, {
      extra: { context: "sign-out-failed" },
    });
  }
  redirect("/");
}
