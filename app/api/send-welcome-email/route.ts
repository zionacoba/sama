import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firstName } = await request.json();

  try {
    await sendWelcomeEmail(user.email, firstName || user.email.split("@")[0]);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[send-welcome-email] failed:", err);
    return NextResponse.json({ error: "Email failed" }, { status: 500 });
  }
}
