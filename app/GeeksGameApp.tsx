"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { CapyClickerScreen } from "./CapyClicker";

type Screen = "home" | "game" | "profile";

const players = [
  { name: "Jacka", score: 1280, rank: 1 },
  { name: "Zhayyil", score: 1040, rank: 2 },
  { name: "Guest", score: 760, rank: 3 },
];

export function GeeksGameApp() {
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <main className="gameShell">
      <header className="gameTopbar">
        <div className="gameBrand">
          <img src="/geeks-lightning.svg" alt="" className="gameLogo" />
          <span>
            GEEKS<span>GAME</span>
          </span>
        </div>
        <span className="gameBadge">demo</span>
      </header>

      {screen === "game" ? (
        <CapyClickerScreen />
      ) : screen === "profile" ? (
        <section className="gameStubScreen">
          <h1>Профиль</h1>
          <p>Здесь будет профиль игрока, достижения и история игр.</p>
        </section>
      ) : (
        <section className="gameHome">
          <div className="gameHero">
            <span>мини-платформа</span>
            <h1>Игры Geeks</h1>
            <p>Демо без базы: моковые игроки, готовая кнопка Game и одна игра на весь экран.</p>
          </div>

          <div className="gameCards">
            {players.map((player) => (
              <article className="gamePlayerCard" key={player.name}>
                <strong>{player.rank}</strong>
                <div>
                  <h2>{player.name}</h2>
                  <span>{player.score} очков</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <nav className="gameBottomNav" aria-label="Навигация GeeksGame">
        <button
          type="button"
          className={screen === "home" ? "active" : ""}
          onClick={() => setScreen("home")}
          aria-label="Рейтинг"
        >
          <span aria-hidden="true">▮▮▮</span>
        </button>
        <button
          type="button"
          className={`gameMainButton ${screen === "game" ? "active" : ""}`}
          onClick={() => setScreen("game")}
          aria-label="Game"
        >
          <span aria-hidden="true">🎮</span>
          <small>Game</small>
        </button>
        <button
          type="button"
          className={screen === "profile" ? "active" : ""}
          onClick={() => setScreen("profile")}
          aria-label="Профиль"
        >
          <span aria-hidden="true">♙</span>
        </button>
      </nav>
    </main>
  );
}
