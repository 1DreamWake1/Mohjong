import { expect, test, type Page } from "@playwright/test";

import { E2E_PLAYER_ONE, E2E_PLAYER_THREE, E2E_PLAYER_TWO } from "./global-setup.js";
import { createRoom, joinRoom, login, toggleReady } from "./helpers.js";

async function startRoomFromLobby(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "开始房间" });
  await expect(startButton).toBeEnabled();
  await startButton.click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page).toHaveURL(/\/game\/demo/);
}

test.describe("多人对局", () => {
  test("两名玩家创建、加入、准备并开局", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const joinerPage = await joinerContext.newPage();

    try {
      await login(ownerPage, E2E_PLAYER_ONE);
      await login(joinerPage, E2E_PLAYER_TWO);

      const roomId = await createRoom(ownerPage);
      await joinRoom(joinerPage, roomId);
      await expect(ownerPage.getByText(E2E_PLAYER_TWO.username, { exact: true })).toBeVisible();

      await toggleReady(ownerPage);
      await toggleReady(joinerPage);

      await startRoomFromLobby(ownerPage);

      // 房主进入牌桌：显示手牌、牌墙和操作计时。
      await expect(ownerPage.getByText("牌墙", { exact: false }).first()).toBeVisible();
      await expect(ownerPage.getByText("请选择一张手牌打出")).toBeVisible();
      await expect(ownerPage.getByLabel(/操作时间/).first()).toBeVisible();

      // 加入者也能进入同一牌桌。
      await expect(joinerPage.getByText("进入牌桌")).toBeVisible();
      await joinerPage.getByRole("button", { name: "进入牌桌" }).click();
      await expect(joinerPage).toHaveURL(/\/game\/demo/);
      await expect(joinerPage.getByText("牌墙", { exact: false }).first()).toBeVisible();
    } finally {
      await ownerContext.close();
      await joinerContext.close();
    }
  });

  test("玩家可以离开房间并重新进入大厅", async ({ page }) => {
    await login(page, E2E_PLAYER_THREE);
    const roomId = await createRoom(page);

    await page.getByRole("button", { name: "退出房间" }).click();
    await expect(page.getByText(roomId)).not.toBeVisible();
    await expect(page.getByText("创建房间或输入房间号加入")).toBeVisible();
  });
});
