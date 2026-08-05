"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GamePhase = "idle" | "playing" | "over";

const ROUND_SECONDS = 20;
const CELL_COUNT = 16;
const BEST_SCORE_KEY = "geeks-game-nursultan-lightning-best";

function nextTarget(current: number) {
  const candidate = Math.floor(Math.random() * (CELL_COUNT - 1));
  return candidate >= current ? candidate + 1 : candidate;
}

export function NursultanTapGame() {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [target, setTarget] = useState(5);
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(window.localStorage.getItem(BEST_SCORE_KEY) ?? 0);
    return Number.isFinite(stored) ? stored : 0;
  });
  const scoreRef = useRef(0);

  const finish = useCallback(() => {
    setPhase("over");
    setBest((currentBest) => {
      const nextBest = Math.max(currentBest, scoreRef.current);
      window.localStorage.setItem(BEST_SCORE_KEY, String(nextBest));
      return nextBest;
    });
  }, []);

  const start = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setCombo(0);
    setSeconds(ROUND_SECONDS);
    setTarget(Math.floor(Math.random() * CELL_COUNT));
    setPhase("playing");
  }, []);

  const hitTarget = useCallback(() => {
    if (phase !== "playing") return;
    const nextCombo = combo + 1;
    const earned = 1 + Math.floor(nextCombo / 5);
    const nextScore = scoreRef.current + earned;
    scoreRef.current = nextScore;
    setScore(nextScore);
    setCombo(nextCombo);
    setTarget((current) => nextTarget(current));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  }, [combo, phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          finish();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finish, phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const mover = window.setInterval(() => {
      setTarget((current) => nextTarget(current));
      setCombo(0);
    }, 920);
    return () => window.clearInterval(mover);
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && phase === "playing") {
        event.preventDefault();
        hitTarget();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hitTarget, phase]);

  return (
    <section className="tapGameScreen" aria-label="Игра Поймай молнию">
      <header className="tapGameHeader">
        <div>
          <span>Nursultan Game</span>
          <h1>Поймай<br />молнию</h1>
        </div>
        <div className="tapGameStats">
          <span><small>Счёт</small>{score}</span>
          <span><small>Рекорд</small>{best}</span>
        </div>
      </header>

      <div className="tapTimer" aria-label={`Осталось ${seconds} секунд`}>
        <span style={{ width: `${(seconds / ROUND_SECONDS) * 100}%` }} />
        <strong>{seconds}</strong>
      </div>

      <div className="tapBoard">
        {Array.from({ length: CELL_COUNT }, (_, index) => (
          <span className="tapCell" key={index}>
            {phase === "playing" && target === index && (
              <button type="button" className="lightningTarget" onClick={hitTarget} aria-label="Поймать молнию">
                ⚡
              </button>
            )}
          </span>
        ))}

        {phase !== "playing" && (
          <div className="tapGameOverlay">
            <span aria-hidden="true">⚡</span>
            <strong>{phase === "over" ? `${score} очков!` : "Проверь реакцию"}</strong>
            <p>{phase === "over" ? "Попробуй побить свой рекорд." : "Нажимай на молнию, пока не закончилось время."}</p>
            <button type="button" onClick={start}>{phase === "over" ? "Ещё раз" : "Играть"}</button>
          </div>
        )}
      </div>

      <div className="tapCombo" aria-live="polite">
        <span>Серия</span><strong>×{combo}</strong><small>Каждые 5 попаданий дают бонус</small>
      </div>
      <p className="tapGameSignature">Автор игры: <strong>Nursultan</strong> · ветка <code>nursultan</code></p>
    </section>
  );
}
