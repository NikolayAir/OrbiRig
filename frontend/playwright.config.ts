import { defineConfig, devices } from "@playwright/test";

import { E2E_BACKEND_URL, E2E_FRONTEND_URL } from "./e2e/servers.mjs";

const backend = new URL(E2E_BACKEND_URL);
const frontend = new URL(E2E_FRONTEND_URL);

// Playwright cancels on SIGINT. Route SIGTERM through the same server teardown.
if (process.platform !== "win32") {
  process.once("SIGTERM", () => process.kill(process.pid, "SIGINT"));
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  // Limit concurrent browser memory use on local machines and CI runners.
  workers: 1,
  retries: 0,
  // Bound local runs, including startup checks outside webServer timeouts.
  // All 3 engines took about 7 minutes on an Apple silicon Mac; slower machines need the margin.
  // CI sets its own limit on the command line for each browser's full suite.
  globalTimeout: 1_200_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      name: "FastAPI E2E",
      command: `python -m uvicorn orbirig.web:app --app-dir ../src --host ${backend.hostname} --port ${backend.port}`,
      url: `${E2E_BACKEND_URL}/openapi.json`,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      name: "Vite E2E",
      command: `npm run dev -- --mode e2e --host ${frontend.hostname} --port ${frontend.port} --strictPort`,
      url: E2E_FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
