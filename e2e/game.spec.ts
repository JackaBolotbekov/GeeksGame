import { expect, test, type Page } from "@playwright/test";

async function expectNoVerticalScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    contentHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.contentHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
}

async function expectMinimumHeight(page: Page, selector: string, minimum: number) {
  const heights = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.every((height) => height >= minimum)).toBe(true);
}

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

test("standard mobile screens fit without vertical scrolling", async ({ browser }) => {
  const contextOptions = { viewport: { width: 390, height: 844 } };
  const hostContext = await browser.newContext(contextOptions);
  const firstContext = await browser.newContext(contextOptions);
  const secondContext = await browser.newContext(contextOptions);
  const spectatorContext = await browser.newContext(contextOptions);
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const spectator = await spectatorContext.newPage();

  await host.goto("/");
  await expectNoVerticalScroll(host);
  await expectMinimumHeight(host, ".role-card", 180);
  await expect.poll(() => host.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("-webkit-tap-highlight-color"),
  )).toBe("rgba(0, 0, 0, 0)");

  await host.locator(".role-host").click();
  await expect(host.locator(".game-screen")).toBeVisible();
  await expectNoVerticalScroll(host);

  await first.goto("/");
  await first.locator(".role-player").click();
  await expectMinimumHeight(first, ".name-preview", 150);
  await expectNoVerticalScroll(first);
  await first.locator(".name-dialog input").fill("Choko");
  await first.locator(".primary-button").click();
  await expect(first.locator(".buzzer")).toBeVisible();
  await expectMinimumHeight(first, ".buzzer", 250);
  await expectNoVerticalScroll(first);

  await second.goto("/");
  await second.locator(".role-player").click();
  await second.locator(".name-dialog input").fill("Meder");
  await second.locator(".primary-button").click();
  await expect(host.locator(".host-player-card")).toHaveCount(2);
  await expectMinimumHeight(host, ".host-player-card", 220);
  await expectNoVerticalScroll(host);

  await spectator.goto("/");
  await spectator.locator(".role-player").click();
  await spectator.locator(".name-dialog input").fill("Viewer");
  await spectator.locator(".primary-button").click();
  await expect(spectator.locator(".queue-banner")).toBeVisible();
  await expectMinimumHeight(spectator, ".score-row", 170);
  await expectNoVerticalScroll(spectator);

  await hostContext.close();
  await firstContext.close();
  await secondContext.close();
  await spectatorContext.close();
});

test("first-time Telegram player can open name onboarding", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          initData: "signed-telegram-init-data",
          ready() {},
          expand() {},
        },
      },
    });
  });
  const page = await context.newPage();

  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ telegramConfigured: true, devAuth: false }),
    }),
  );
  await page.route("**/api/auth/telegram", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessionToken: "telegram-session",
        profile: { displayName: null, avatarUrl: null, kind: "telegram" },
        needsName: true,
      }),
    }),
  );

  await page.goto("/");
  const playerButton = page.locator(".role-player");
  await expect(playerButton).toBeEnabled();
  await playerButton.click();
  await expect(page.locator(".name-dialog")).toBeVisible();
  await expect(page.locator(".name-dialog input")).toBeFocused();

  await context.close();
});
