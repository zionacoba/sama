import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendWelcomeEmail } from "@/lib/resend";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const phone = user.user_metadata?.phone as string | undefined;
        const first_name = user.user_metadata?.first_name as string | undefined;
        const last_name = user.user_metadata?.last_name as string | undefined;
        const admin = createSupabaseAdminClient();
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        await admin.from("profiles").upsert(
          {
            id: user.id,
            ...(phone ? { phone } : {}),
            ...(first_name ? { first_name } : {}),
            ...(last_name ? { last_name } : {}),
          },
          { onConflict: "id" }
        );
        if (!existingProfile && user.email) {
          try {
            await sendWelcomeEmail(user.email, first_name ?? user.email.split("@")[0]);
          } catch (err) {
            console.error("[auth/callback] welcome email failed:", err);
          }
        }
      }
      return NextResponse.redirect(`${origin}${safePath}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
