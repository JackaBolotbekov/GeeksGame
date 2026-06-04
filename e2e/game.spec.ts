import { expect, test } from "@playwright/test";

test("host and two players can run a scoring round", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await host.goto("/");
  await host.getByRole("button", { name: "Я ведущий" }).click();
  await expect(host.getByText("Панель ведущего")).toBeVisible();

  await first.goto("/");
  await first.getByRole("button", { name: "Я игрок" }).click();
  await first.getByLabel("Имя или ник").fill("Чоко");
  await first.getByRole("button", { name: "В игру" }).click();
  await expect(first.getByText("Играет Чоко")).toBeVisible();

  await second.goto("/");
  await second.getByRole("button", { name: "Я игрок" }).click();
  await second.getByLabel("Имя или ник").fill("Медер");
  await second.getByRole("button", { name: "В игру" }).click();
  await expect(host.getByText("Медер")).toBeVisible();

  await first.getByRole("button", { name: "Знаю ответ" }).click();
  await expect(host.getByText("Есть ответ!")).toBeVisible();
  await host.locator(".plus-zone").first().click();
  await expect(first.locator(".score-row").first().locator(".score-value strong")).toHaveText("1");

  await hostContext.close();
  await firstContext.close();
  await secondContext.close();
});
