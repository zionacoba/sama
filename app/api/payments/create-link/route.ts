import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bookingId = body.bookingId as number | undefined;
    const amount = body.amount as number | undefined;
    const description = body.description as string | undefined;

    if (!bookingId || !amount || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
      console.error("[paymongo] PAYMONGO_SECRET_KEY not configured");
      return NextResponse.json({ error: "Payment service unavailable" }, { status: 503 });
    }

    const admin = createSupabaseAdminClient();
    const { data: booking } = await admin
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const centavos = Math.round(amount * 100);
    const ref = bookingId.toString(16).toUpperCase().slice(-8).padStart(8, "0");
    const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");

    const pmRes = await fetch("https://api.paymongo.com/v1/links", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: centavos,
            description,
            remarks: `Booking #${ref}`,
            redirect: {
              success: `${SITE_URL}/payment/success?bookingId=${bookingId}`,
              failed: `${SITE_URL}/payment/failed?bookingId=${bookingId}`,
            },
          },
        },
      }),
    });

    if (!pmRes.ok) {
      const err = await pmRes.json().catch(() => ({}));
      console.error("[paymongo] link creation failed:", pmRes.status, JSON.stringify(err));
      return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
    }

    const pmData = await pmRes.json();
    const linkId: string = pmData.data.id;
    const checkoutUrl: string = pmData.data.attributes.checkout_url;

    return NextResponse.json({ checkoutUrl, linkId });
  } catch (err) {
    console.error("[paymongo] create-link error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
