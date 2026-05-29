import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#1a5c38",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Mountain silhouette */}
        <svg
          width="320"
          height="320"
          viewBox="0 0 320 320"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background mountain */}
          <polygon points="200,60 320,260 80,260" fill="rgba(255,255,255,0.35)" />
          {/* Foreground mountain */}
          <polygon points="120,100 280,280 0,280" fill="white" />
          {/* Snow cap */}
          <polygon points="120,100 148,148 92,148" fill="rgba(255,255,255,0.7)" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
