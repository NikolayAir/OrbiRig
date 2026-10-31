import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

import { E2E_BACKEND_URL } from "./e2e/servers.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // Build the frontend into the ignored static directory for serving through the FastAPI app.
    outDir: "../src/orbirig/static",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Browser tests must reach their own backend rather than an unrelated development server.
      "/api": mode === "e2e" ? E2E_BACKEND_URL : "http://127.0.0.1:8000",
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
}));
