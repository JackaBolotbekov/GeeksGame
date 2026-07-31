import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home page renders GeeksGame without database dependencies", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/GeeksGameApp.tsx", import.meta.url), "utf8");

  assert.match(page, /GeeksGameApp/);
  assert.doesNotMatch(page, /listStudents|lib\/store|api\(/);
  assert.match(app, /GEEKS/);
  assert.match(app, /GAME/);
  assert.match(app, /SnakeGameScreen/);
});

test("center navigation opens the game screen", async () => {
  const app = await readFile(new URL("../app/GeeksGameApp.tsx", import.meta.url), "utf8");

  assert.match(app, /type Screen = "home" \| "game" \| "profile"/);
  assert.match(app, /setScreen\("game"\)/);
  assert.match(app, /gameMainButton/);
  assert.match(app, /Game/);
});
