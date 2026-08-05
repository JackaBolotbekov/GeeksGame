"use client";

import { useState } from "react";
import { NursultanTapGame } from "./NursultanTapGame";
import { SnakeGameScreen } from "./SnakeGame";

type SelectedGame = "catalog" | "snake" | "nursultan-tap";

export function GamesHub() {
  const [selectedGame, setSelectedGame] = useState<SelectedGame>("catalog");

  if (selectedGame !== "catalog") {
    return (
      <section className="gamesHub gamesHubPlaying">
        <button className="gamesBackButton" type="button" onClick={() => setSelectedGame("catalog")}>
          <span aria-hidden="true">←</span> Все игры
        </button>
        {selectedGame === "snake" ? <SnakeGameScreen /> : <NursultanTapGame />}
      </section>
    );
  }

  return (
    <section className="gamesHub" aria-labelledby="games-title">
      <header className="gamesCatalogHeader">
        <span>GeeksService Arcade</span>
        <h1 id="games-title">Игры</h1>
        <p>Выбирай игру, набирай очки и улучшай свой рекорд.</p>
      </header>

      <div className="gamesCatalog">
        <button className="gameCatalogCard nursultanGameCard" type="button" onClick={() => setSelectedGame("nursultan-tap")}>
          <span className="gameCatalogBadge">NEW</span>
          <span className="tapCardPreview" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i /><i />
            <b>⚡</b>
          </span>
          <span className="gameCatalogMeta">Реакция · 20 секунд</span>
          <strong>Поймай молнию</strong>
          <small>Автор: Nursultan</small>
        </button>

        <button className="gameCatalogCard snakeGameCard" type="button" onClick={() => setSelectedGame("snake")}>
          <span className="snakeCardPreview" aria-hidden="true"><i /><i /><i /><i /><b /></span>
          <span className="gameCatalogMeta">Аркада · Без лимита</span>
          <strong>Змейка</strong>
          <small>Классическая игра Geeks</small>
        </button>
      </div>

      <p className="gamesCatalogHint">Нажми на карточку, чтобы начать</p>
    </section>
  );
}
