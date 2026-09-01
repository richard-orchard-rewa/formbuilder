import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      // Runs the API directly via tsx rather than `npm run dev -w server`,
      // which requires a server/.env file — DATABASE_URL is expected to
      // already be set on this process's env instead (as CI does).
      command: "npx tsx src/server.ts",
      cwd: "../server",
      url: "http://localhost:3000/api/forms",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --port 5173 --strictPort",
      cwd: "../client",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
})
