import fs from "fs";
import path from "path";
import { ImageResponse } from "next/og";

export const alt = "Trip on Sama";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const badgePath = path.join(process.cwd(), "public", "sama-badge.png");
const badgeBase64 = fs.readFileSync(badgePath).toString("base64");
const badgeSrc = `data:image/png;base64,${badgeBase64}`;

type TripRow = {
  title: string;
  destination: string;
  photos: string[] | null;
};

async function fetchTrip(slug: string): Promise<TripRow | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!baseUrl || !anonKey) return null;

  const url = `${baseUrl}/rest/v1/trips?slug=eq.${encodeURIComponent(slug)}&select=title,destination,photos&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!res.ok) return null;

  const rows: TripRow[] = await res.json();
  return rows[0] ?? null;
}

async function fetchPhotoDataUrl(photoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(photoUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
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

  const title = trip?.title ?? "Adventure awaits";
  const destination = trip?.destination ?? "";
  const photoUrl = trip?.photos?.[0] ?? null;
  const photoDataUrl = photoUrl ? await fetchPhotoDataUrl(photoUrl) : null;

  const titleSize = title.length > 50 ? 54 : title.length > 35 ? 64 : 72;

  try {
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

          <div
            style={{
              position: "absolute",
              top: 48,
              left: 56,
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#ffffff",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={badgeSrc}
              alt=""
              style={{ height: 28, width: 28, filter: "brightness(0) invert(1)" }}
            />
            Sama
          </div>

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
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #292524 0%, #1c1917 100%)",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 72,
            fontWeight: 700,
          }}
        >
          Sama
        </div>
      ),
      { ...size },
    );
  }
}
