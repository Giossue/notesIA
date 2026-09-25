import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.NOTESIA_API_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    strictPort: true,
    proxy: {
      "/v1": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    strictPort: true,
    proxy: {
      "/v1": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
