import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bu uygulama tamamen dinamik ve kimlik doğrulamalıdır (statik/PPR
  // önbellekten fayda görecek genel sayfa yoktur), bu yüzden Cache
  // Components/PPR kapalı tutulur.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
