import type { NextConfig } from "next";

import { previewApiUrl } from "./src/lib/api/preview-api-url";

// En una vista previa de Vercel la API es el /api de ese mismo despliegue.
const apiUrl = previewApiUrl(process.env);

const nextConfig: NextConfig = {
  output: "export",
  ...(apiUrl ? { env: { NEXT_PUBLIC_API_URL: apiUrl } } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
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
