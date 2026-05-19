import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Trip on Sama";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type TripRow = {
  title: string;
  destination: string;
  photos: string[] | null;
};

async function fetchTrip(slug: string): Promise<TripRow | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) return null;

  const url = `${baseUrl}/rest/v1/trips?slug=eq.${encodeURIComponent(slug)}&select=title,destination,photos&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const rows: TripRow[] = await res.json();
  return rows[0] ?? null;
}

async function fetchPhotoDataUrl(photoUrl: string): Promise<string | null> {
  console.log("[og-image] fetching photo:", photoUrl);
  try {
    const res = await fetch(photoUrl);
    console.log("[og-image] photo fetch status:", res.status, res.statusText);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    console.log("[og-image] photo buffer size:", buffer.byteLength, "mime:", mime);
    // Buffer is available in the Vercel Edge runtime
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.error("[og-image] photo fetch error:", err);
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const trip = await fetchTrip(slug);
  console.log("[og-image] slug:", slug, "trip:", JSON.stringify(trip));

  const title = trip?.title ?? "Adventure awaits";
  const destination = trip?.destination ?? "";
  const photoUrl = trip?.photos?.[0] ?? null;
  console.log("[og-image] photoUrl:", photoUrl);

  // Embed the photo as a data URI so Satori doesn't need to make
  // an outbound fetch from the Edge sandbox
  const photoDataUrl = photoUrl ? await fetchPhotoDataUrl(photoUrl) : null;
  console.log("[og-image] photoDataUrl present:", !!photoDataUrl);

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
        {/* Background photo embedded as data URI */}
        {photoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoDataUrl}
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

        {/* Dark gradient overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: photoDataUrl
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
            paddingLeft: 56,
            paddingRight: 56,
            paddingBottom: 52,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {destination ? (
            <div
              style={{
                color: "rgba(255,255,255,0.70)",
                fontSize: 22,
                letterSpacing: "0.08em",
                marginBottom: 12,
                display: "flex",
              }}
            >
              {destination.toUpperCase()}
            </div>
          ) : null}
          <div
            style={{
              color: "#ffffff",
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              display: "flex",
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
