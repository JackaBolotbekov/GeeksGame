import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __ytLastAction: string | null;
    __ytLastVideoId: string | null;
    __shoutPlayed: number;
  }
}

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

async function expectInsideViewport(page: Page, selector: string) {
  const boxes = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every((box) => box.top >= -1 && box.bottom <= box.viewportHeight + 1)).toBe(true);
}

async function routeYouTubeStub(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.__ytLastAction = null;
        window.__ytLastVideoId = null;
        window.YT = {
          PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
          Player: function(element, options) {
            element.innerHTML = '<iframe title="YouTube video player"></iframe>';
            window.__ytLastVideoId = options.videoId;
            this.playVideo = function() {
              window.__ytLastAction = 'play';
              options.events && options.events.onStateChange && options.events.onStateChange({ data: 1 });
            };
            this.pauseVideo = function() {
              window.__ytLastAction = 'pause';
              options.events && options.events.onStateChange && options.events.onStateChange({ data: 2 });
            };
            this.cueVideoById = function(videoId) {
              window.__ytLastVideoId = videoId;
            };
            this.loadVideoById = function(videoId) {
              window.__ytLastVideoId = videoId;
              this.playVideo();
            };
            this.destroy = function() {};
            setTimeout(function() {
              options.events && options.events.onReady && options.events.onReady();
              if (options.playerVars && options.playerVars.autoplay) {
                window.__ytLastAction = 'play';
                options.events && options.events.onStateChange && options.events.onStateChange({ data: 1 });
              }
            }, 0);
          }
        };
        window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
      `,
    }),
  );
}

async function installFallbackAudioCounter(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__shoutPlayed", { value: 0, writable: true });
    class FakeParam {
      setValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        return {
          type: "square",
          frequency: new FakeParam(),
          connect() {},
          start() { window.__shoutPlayed += 1; },
          stop() {},
        };
      }
      createGain() {
        return { gain: new FakeParam(), connect() {} };
      }
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
  });
}

test("host and two players can run a scoring round", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await routeYouTubeStub(host);
  await installFallbackAudioCounter(first);

  await host.goto("/");
  await host.getByRole("button", { name: "Я ведущий" }).click();
  await expect(host.getByText("Панель ведущего")).toBeVisible();
  const resizer = host.locator(".host-stage-resizer");
  await expect(resizer).toBeVisible();
  const splitBefore = await host.locator(".host-stage").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  const resizerBox = await resizer.boundingBox();
  if (!resizerBox) throw new Error("Host split resizer is not measurable");
  await host.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2);
  await host.mouse.down();
  await host.mouse.move(resizerBox.x - 90, resizerBox.y + resizerBox.height / 2);
  await host.mouse.up();
  const splitAfter = await host.locator(".host-stage").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(splitAfter).not.toBe(splitBefore);
  const hostLayout = await host.locator(".host-stage").evaluate(() => {
    const game = document.querySelector(".host-stage-game")?.getBoundingClientRect();
    const heading = document.querySelector(".host-stage-game > .screen-heading")?.getBoundingClientRect();
    const music = document.querySelector(".host-stage-music")?.getBoundingClientRect();
    if (!game || !heading || !music) throw new Error("Host layout is missing required blocks");
    return {
      gameLeft: game.left,
      gameRight: game.right,
      headingLeft: heading.left,
      headingRight: heading.right,
      musicRight: music.right,
    };
  });
  expect(hostLayout.headingLeft).toBeGreaterThanOrEqual(hostLayout.gameLeft - 1);
  expect(hostLayout.headingRight).toBeLessThanOrEqual(hostLayout.gameRight + 1);
  expect(hostLayout.headingLeft).toBeGreaterThanOrEqual(hostLayout.musicRight - 1);
  await host.getByLabel("Найти песню в YouTube").fill("чоко");
  await host.getByRole("button", { name: "Найти" }).click();
  await expect(host.locator(".youtube-browser")).toBeVisible();
  await expect(host.locator(".music-quick-grid")).toHaveCount(0);
  await expect(host.locator(".youtube-topic-chips button")).toHaveCount(8);
  await expect(host.locator(".music-results button:not(.music-load-more)")).toHaveCount(12);
  await expect(host.locator(".music-load-more")).toBeVisible();
  await host.locator(".music-load-more").dispatchEvent("click");
  await expect(host.locator(".music-results button:not(.music-load-more)")).toHaveCount(24);
  await expect(host.locator(".music-load-more")).toHaveCount(0);
  await host.locator(".music-results button:not(.music-load-more)").first().click();
  await expect(host.locator(".music-results button:not(.music-load-more)")).toHaveCount(24);
  await expect(host.locator(".music-results button.is-selected")).toHaveCount(1);
  await expect(host.locator(".track-ticker").getByText("чоко · тестовый трек")).toBeVisible();
  await expect.poll(() => host.evaluate(() => window.__ytLastVideoId)).toBe("dQw4w9WgXcQ");
  await expect.poll(() => host.evaluate(() => window.__ytLastAction)).toBe("play");

  await host.getByRole("button", { name: "+ плейлист" }).click();
  await expect(host.locator(".playlist-sidebar .playlist-composer")).toBeVisible();
  await expect(host.locator(".youtube-main-feed .playlist-composer")).toHaveCount(0);
  await host.getByLabel("PIN админки плейлистов").fill("1234");
  await host.getByRole("button", { name: "Открыть плейлисты" }).click();
  await expect(host.getByText("Админка плейлистов открыта")).toBeVisible();
  await host.getByLabel("Ссылка на YouTube плейлист").fill("https://www.youtube.com/playlist?list=PLgeeksgame12345");
  await host.getByLabel("Название плейлиста").fill("Старые хиты");
  await host.getByRole("button", { name: "Сохранить плейлист" }).click();
  await expect(host.locator(".playlist-card").filter({ hasText: "Старые хиты" })).toBeVisible();
  await expect(host.locator(".playlist-add-form")).toBeVisible();
  await host.getByRole("button", { name: "Закрыть" }).click();
  await expect(host.locator(".playlist-composer")).toHaveCount(0);
  await host.locator(".playlist-card").filter({ hasText: "Старые хиты" }).click();
  await expect(host.locator(".music-results button:not(.music-load-more)")).toHaveCount(24);
  await expect(host.locator(".music-results button:not(.music-load-more)").first().locator("small")).toHaveCount(0);
  await expect(host.locator(".music-load-more")).toBeVisible();
  await host.locator(".music-load-more").dispatchEvent("click");
  await expect(host.locator(".music-results button:not(.music-load-more)")).toHaveCount(48);
  await host.locator(".music-results button:not(.music-load-more)").first().click();
  await expect(host.locator(".track-ticker").getByText("PLgeeksgame12345 · плейлист трек 1")).toBeVisible();
  await expect.poll(() => host.evaluate(() => window.__ytLastVideoId)).toBe("M7lc1UVf-VE");
  await expect.poll(() => host.evaluate(() => window.__ytLastAction)).toBe("play");

  await first.goto("/");
  await first.getByRole("button", { name: "Я игрок" }).click();
  await first.getByLabel("Имя или ник").fill("Чоко");
  await first.getByRole("button", { name: "В игру" }).click();
  await expect(first.getByText("Играет Чоко")).toBeVisible();
  await expect(first.locator(".player-screen .track-ticker strong")).toHaveText("Песня играет");
  await expect(first.getByText("PLgeeksgame12345 · плейлист трек 1")).toHaveCount(0);

  await second.goto("/");
  await second.getByRole("button", { name: "Я игрок" }).click();
  await second.getByLabel("Имя или ник").fill("Медер");
  await second.getByRole("button", { name: "В игру" }).click();
  await expect(host.getByText("Медер")).toBeVisible();

  await first.getByRole("button", { name: "Знаю ответ" }).click();
  await expect.poll(() => first.evaluate(() => window.__shoutPlayed)).toBe(1);
  await expect(host.getByText("Есть ответ!")).toBeVisible();
  await expect.poll(() => host.evaluate(() => window.__ytLastAction)).toBe("pause");
  await expect(host.locator(".answer-timer strong")).toBeVisible();
  const timerValue = Number(await host.locator(".answer-timer strong").innerText());
  expect(timerValue).toBeGreaterThan(0);
  expect(timerValue).toBeLessThanOrEqual(10);
  await expect(first.locator(".answer-banner")).toBeVisible();
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
  const thirdContext = await browser.newContext(contextOptions);
  const fourthContext = await browser.newContext(contextOptions);
  const spectatorContext = await browser.newContext(contextOptions);
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const third = await thirdContext.newPage();
  const fourth = await fourthContext.newPage();
  const spectator = await spectatorContext.newPage();
  await installFallbackAudioCounter(first);

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

  await first.locator(".buzzer").click();
  await expect(first.locator(".player-screen.has-answer-attempt")).toBeVisible();
  await expect(host.locator(".host-screen.has-answer-attempt")).toBeVisible();
  await expect(first.locator(".answer-banner")).toBeVisible();
  await expectMinimumHeight(first, ".buzzer", 150);
  await expectInsideViewport(first, ".buzzer");
  await expectInsideViewport(first, ".answer-banner");
  await expectInsideViewport(host, ".host-player-card");
  await expectNoVerticalScroll(first);
  await expectNoVerticalScroll(host);
  await host.locator(".plus-zone").first().click();
  await expect(first.locator(".player-screen.has-answer-attempt")).toHaveCount(0);

  await third.goto("/");
  await third.locator(".role-player").click();
  await third.locator(".name-dialog input").fill("Aliya");
  await third.locator(".primary-button").click();
  await expect(third.locator(".buzzer")).toBeVisible();
  await expectNoVerticalScroll(third);

  await fourth.goto("/");
  await fourth.locator(".role-player").click();
  await fourth.locator(".name-dialog input").fill("Ermek");
  await fourth.locator(".primary-button").click();
  await expect(fourth.locator(".buzzer")).toBeVisible();
  await expect(host.locator(".host-player-card")).toHaveCount(4);
  await expectMinimumHeight(host, ".host-player-card", 100);
  await expectNoVerticalScroll(host);

  await spectator.goto("/");
  await spectator.locator(".role-player").click();
  await spectator.locator(".name-dialog input").fill("Viewer");
  await spectator.locator(".primary-button").click();
  await expect(spectator.locator(".queue-banner")).toBeVisible();
  await expectMinimumHeight(spectator, ".score-row", 40);
  await expectNoVerticalScroll(spectator);

  await hostContext.close();
  await firstContext.close();
  await secondContext.close();
  await thirdContext.close();
  await fourthContext.close();
  await spectatorContext.close();
});

test("android player buzzer stays a large bottom tap target", async ({ browser }) => {
  const contextOptions = {
    viewport: { width: 360, height: 740 },
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
  };
  const hostContext = await browser.newContext(contextOptions);
  const playerContext = await browser.newContext(contextOptions);
  const host = await hostContext.newPage();
  const player = await playerContext.newPage();
  await installFallbackAudioCounter(player);

  await host.goto("/");
  await host.locator(".role-host").click();
  await expect(host.locator(".host-screen")).toBeVisible();

  await player.goto("/");
  await player.locator(".role-player").click();
  await player.locator(".name-dialog input").fill("Android");
  await player.locator(".primary-button").click();
  await expect(player.locator(".buzzer")).toBeVisible();
  await expectMinimumHeight(player, ".buzzer", 220);
  await expectInsideViewport(player, ".buzzer");
  await expectNoVerticalScroll(player);

  await player.locator(".buzzer").click();
  await expect(player.locator(".player-screen.has-answer-attempt")).toBeVisible();
  await expect(player.locator(".answer-banner")).toBeVisible();
  await expectMinimumHeight(player, ".buzzer", 150);
  await expectInsideViewport(player, ".buzzer");
  await expectInsideViewport(player, ".answer-banner");
  await expectNoVerticalScroll(player);

  await hostContext.close();
  await playerContext.close();
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
