import type { Page } from "@playwright/test";

export type E2EUser = {
  password: string;
  username: string;
};

export async function login(page: Page, user: E2EUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(user.username);
  await page.getByLabel("密码").fill(user.password);
  await page.getByRole("button", { name: "登录" }).click();
}

export async function createRoom(page: Page): Promise<string> {
  await page.getByRole("button", { name: "创建房间" }).click();
  const roomHeading = page.locator("h2").filter({ hasText: /^room-/ });
  await roomHeading.waitFor();
  const heading = await roomHeading.textContent();
  if (!heading) {
    throw new Error("Room id heading not found after creating a room");
  }
  return heading.trim();
}

export async function joinRoom(page: Page, roomId: string): Promise<void> {
  await page.getByLabel("房间号").fill(roomId);
  await page.getByRole("button", { name: "加入房间" }).click();
  await page.getByText(roomId, { exact: false }).first().waitFor();
}

export async function toggleReady(page: Page): Promise<void> {
  // Socket acknowledgement replaces this button before Playwright considers the
  // click stable. The replacement state is the authoritative completion signal.
  await page
    .getByRole("button", { name: "准备", exact: true })
    .click({ timeout: 2_000 })
    .catch(() => undefined);
  await page.getByRole("button", { name: "取消准备", exact: true }).waitFor();
}
