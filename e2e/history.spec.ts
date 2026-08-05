import { expect, test } from "@playwright/test";

import { E2E_PLAYER_ONE } from "./global-setup.js";
import { login } from "./helpers.js";

test.describe("对局历史", () => {
  test("玩家历史页显示已结束对局并展示结算明细", async ({ page }) => {
    await login(page, E2E_PLAYER_ONE);

    await page.getByRole("button", { name: "历史对局" }).click();
    await expect(page).toHaveURL(/\/game\/history/);

    // seeded 已结束对局出现在列表中（自摸、8 分）。
    const endedRow = page.getByRole("button", { name: /e2e-ended-room/ });
    await expect(endedRow).toBeVisible();
    await expect(endedRow).toContainText("自摸");
    await expect(endedRow).toContainText("8 分");

    // 点击后展示结算明细。
    await endedRow.click();
    await expect(page.getByText("结算明细")).toBeVisible();
    await expect(page.getByText(/番数：2，总分：8/)).toBeVisible();
    await expect(page.getByText(/自摸 1番/)).toBeVisible();
    await expect(page.getByText("1号位")).toBeVisible();
  });

  test("历史筛选可以过滤已结束对局", async ({ page }) => {
    await login(page, E2E_PLAYER_ONE);

    await page.getByRole("button", { name: "历史对局" }).click();
    await expect(page).toHaveURL(/\/game\/history/);

    await page.getByRole("button", { name: "已结束", exact: true }).click();
    await expect(page.getByRole("button", { name: /e2e-ended-room/ })).toBeVisible();

    await page.getByRole("button", { name: "进行中", exact: true }).click();
    await expect(page.getByRole("button", { name: /e2e-ended-room/ })).not.toBeVisible();
  });
});
