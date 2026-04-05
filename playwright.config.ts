import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // @playwright/test 1.58 기준 번들에 포함된 iPhone 중 가장 최신 라인 (iPhone 16 프리셋은 아직 없음)
    { name: "iphone", use: { ...devices["iPhone 15 Pro Max"] } },
  ],
  webServer: process.env.CI
    ? { command: "npm run start", url: "http://localhost:3000", timeout: 60_000 }
    : undefined,
});
