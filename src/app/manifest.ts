import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ManiCepte Muhasebe",
    short_name: "ManiCepte",
    description: "Kişiler arası gider ve borç takibi",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      { src: "/api/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/icon/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/api/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
