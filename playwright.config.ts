import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: {
      width: 1440,
      height: 960
    }
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  webServer: [
    {
      command: "npm run -w @kugnus/api start",
      url: "http://127.0.0.1:4174/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command:
        "npm run -w @kugnus/web dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
});
