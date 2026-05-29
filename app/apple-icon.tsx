import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          borderRadius: "38px",
        }}
      >
        {/* Mountain silhouette */}
        <svg
          width="112"
          height="112"
          viewBox="0 0 320 320"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points="200,60 320,260 80,260" fill="rgba(255,255,255,0.35)" />
          <polygon points="120,100 280,280 0,280" fill="white" />
          <polygon points="120,100 148,148 92,148" fill="rgba(255,255,255,0.7)" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
