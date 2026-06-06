import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sama",
    short_name: "Sama",
    description: "Philippine outdoor adventure marketplace",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a5c38",
    icons: [
      {
        src: "/sama-badge.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/sama-badge.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
