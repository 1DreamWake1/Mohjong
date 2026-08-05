import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const e2eDatabasePath = resolve("data", "e2e.db");
const e2eDatabaseUrl = `file:${e2eDatabasePath}`;
const localNoProxy = "127.0.0.1,localhost";

process.env.NO_PROXY = [process.env.NO_PROXY, localNoProxy].filter(Boolean).join(",");
process.env.no_proxy = [process.env.no_proxy, localNoProxy].filter(Boolean).join(",");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      // 先准备干净的 e2e 数据库并迁移，再启动 Server（webServer 先于 globalSetup 运行）。
      command: `mkdir -p data && rm -f "${e2eDatabasePath}" && DATABASE_URL="${e2eDatabaseUrl}" pnpm exec prisma migrate deploy --schema prisma/schema.prisma && DATABASE_URL="${e2eDatabaseUrl}" pnpm --filter server dev`,
      cwd: ".",
      env: { DATABASE_URL: e2eDatabaseUrl },
      url: "http://127.0.0.1:3000/health",
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: "pnpm --filter web dev",
      cwd: ".",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
