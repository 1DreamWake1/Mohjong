import { expect, test } from "@playwright/test";

import { E2E_ADMIN, E2E_PLAYER_ONE } from "./global-setup.js";
import { login } from "./helpers.js";

test.describe("登录", () => {
  test("玩家登录成功并进入大厅", async ({ page }) => {
    await login(page, E2E_PLAYER_ONE);

    await expect(page).toHaveURL(/\/lobby/);
    await expect(page.getByRole("heading", { name: "玩家大厅" })).toBeVisible();
    await expect(page.getByRole("heading", { name: E2E_PLAYER_ONE.username })).toBeVisible();
  });

  test("管理员登录成功并进入管理页", async ({ page }) => {
    await login(page, E2E_ADMIN);

    await expect(page).toHaveURL(/\/admin\/players/);
    await expect(page.getByRole("heading", { name: "系统管理" })).toBeVisible();
  });

  test("错误密码显示失败提示", async ({ page }) => {
    await login(page, { password: "wrong-password", username: E2E_PLAYER_ONE.username });

    await expect(page.getByText("账号或密码不正确")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
