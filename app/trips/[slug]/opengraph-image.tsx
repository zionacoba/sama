import { ImageResponse } from "next/og";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const alt = "Trip on Sama";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = createSupabaseAdminClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("title, destination, photos")
    .eq("slug", slug)
    .maybeSingle();

  const title = trip?.title ?? "Adventure awaits";
  const destination = trip?.destination ?? "";
  const photo = trip?.photos?.[0] ?? null;

  // Clamp font size so long titles don't overflow
  const titleSize = title.length > 50 ? 54 : title.length > 35 ? 64 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: "#1c1917",
        }}
      >
        {/* Background photo */}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {/* Dark gradient: transparent top → dark bottom */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: photo
              ? "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.22) 38%, rgba(0,0,0,0.84) 100%)"
              : "linear-gradient(135deg, #292524 0%, #1c1917 100%)",
            display: "flex",
          }}
        />

        {/* ⛰ Sama — top-left */}
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 56,
            display: "flex",
            alignItems: "center",
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          ⛰ Sama
        </div>

        {/* Trip info — bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0 56px 52px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {destination && (
            <div
              style={{
                color: "rgba(255,255,255,0.70)",
                fontSize: 22,
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              {destination.toUpperCase()}
            </div>
          )}
          <div
            style={{
              color: "#ffffff",
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
            }}
          >
            {title}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
