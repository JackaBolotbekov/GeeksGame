import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home page renders the original Geeks layout from a static snapshot", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/GeeksServiceApp.tsx", import.meta.url), "utf8");
  const snapshot = await readFile(new URL("../app/staticSnapshot.ts", import.meta.url), "utf8");

  assert.match(page, /GeeksServiceApp/);
  assert.match(page, /STATIC_STUDENTS/);
  assert.match(page, /STATIC_SCHEDULE/);
  assert.match(page, /staticMode/);
  assert.doesNotMatch(page, /listStudents|lib\/store|api\(/);
  assert.match(app, /GEEKS/);
  assert.match(app, /GAME/);
  assert.match(app, /className="studentMain"/);
  assert.match(app, /className="bottomNav"/);
  assert.match(app, /SnakeGameScreen/);
  assert.match(snapshot, /Нурэл Абдыкулов/);
  assert.match(snapshot, /Мирас Орозов/);
  assert.match(snapshot, /июль 2026/);
});

test("center navigation opens the game screen", async () => {
  const app = await readFile(new URL("../app/GeeksServiceApp.tsx", import.meta.url), "utf8");

  assert.match(app, /type ActiveScreen = "leaderboard" \| "homeworkUpload" \| "game" \| "profile"/);
  assert.match(app, /setActiveScreen\("game"\)/);
  assert.match(app, /gameNavButton/);
  assert.match(app, /Game/);
});
