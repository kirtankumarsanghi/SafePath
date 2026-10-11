import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "sharp"],
  outputFileTracingIncludes: {
    "/api/maps/analyze": ["./assets/ocr/**/*", "./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*"],
  },
  // The landing page is plain HTML/CSS/JS served from ./public.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
};
export default nextConfig;
