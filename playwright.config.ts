import { defineConfig } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev",
    url: new URL("/api/health", baseURL).toString(),
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
