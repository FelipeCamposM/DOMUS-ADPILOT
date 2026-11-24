import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DOMUS AdPilot",
    short_name: "AdPilot",
    start_url: "/",
    display: "standalone",
    background_color: "#050407",
    theme_color: "#050407",
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
      { src: "/apple-icon.png", sizes: "any", type: "image/png", purpose: "maskable" },
    ],
  };
}
