import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ configPath: "./wrangler.jsonc" }),
  ],
  resolve: {
    alias: {
      "@": "/src",
      "@shared": "/lib",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    // Browser tests must not be navigated by documentation edits or HMR reloads.
    hmr: process.env.PLAYWRIGHT_TEST === "1" ? false : undefined,
  },
});
