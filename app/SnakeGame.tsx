"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";
type GamePhase = "idle" | "running" | "paused" | "over";

const BOARD_SIZE = 18;
const TICK_MS = 125;
const INITIAL_SNAKE: Point[] = [
  { x: 8, y: 9 },
  { x: 7, y: 9 },
  { x: 6, y: 9 },
];

const MOVES: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function nextFood(snake: Point[]): Point {
  const free: Point[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const point = { x, y };
      if (!snake.some((part) => samePoint(part, point))) free.push(point);
    }
  }
  return free[Math.floor(Math.random() * free.length)] ?? { x: 2, y: 2 };
}

export function SnakeGameScreen() {
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Point>({ x: 13, y: 9 });
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(window.localStorage.getItem("geeks-game-snake-best") ?? 0);
    return Number.isFinite(stored) ? stored : 0;
  });
  const directionRef = useRef<Direction>("right");
  const pendingDirectionRef = useRef<Direction>("right");
  const touchStartRef = useRef<Point | null>(null);

  const reset = useCallback(() => {
    setSnake(INITIAL_SNAKE);
    setFood({ x: 13, y: 9 });
    setScore(0);
    directionRef.current = "right";
    pendingDirectionRef.current = "right";
    setPhase("running");
  }, []);

  const steer = useCallback((next: Direction) => {
    if (OPPOSITE[directionRef.current] === next) return;
    pendingDirectionRef.current = next;
    setPhase((current) => current === "idle" || current === "paused" ? "running" : current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const controls: Record<string, Direction | undefined> = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
      };
      const next = controls[event.key];
      if (next) {
        event.preventDefault();
        steer(next);
      }
      if (event.key === " " && phase === "running") {
        event.preventDefault();
        setPhase("paused");
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, steer]);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      setSnake((current) => {
        const direction = pendingDirectionRef.current;
        directionRef.current = direction;
        const move = MOVES[direction];
        const head = current[0];
        const nextHead = {
          x: (head.x + move.x + BOARD_SIZE) % BOARD_SIZE,
          y: (head.y + move.y + BOARD_SIZE) % BOARD_SIZE,
        };
        const ate = samePoint(nextHead, food);
        const bodyToCheck = ate ? current : current.slice(0, -1);
        if (bodyToCheck.some((part) => samePoint(part, nextHead))) {
          setPhase("over");
          return current;
        }
        const nextSnake = [nextHead, ...current];
        if (!ate) nextSnake.pop();
        if (ate) {
          setFood(nextFood(nextSnake));
          setScore((currentScore) => {
            const nextScore = currentScore + 1;
            setBest((currentBest) => {
              const nextBest = Math.max(currentBest, nextScore);
              window.localStorage.setItem("geeks-game-snake-best", String(nextBest));
              return nextBest;
            });
            return nextScore;
          });
        }
        return nextSnake;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [food, phase]);

  const snakeCells = new Map(snake.map((point, index) => [`${point.x}:${point.y}`, index]));
  const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
    const x = index % BOARD_SIZE;
    const y = Math.floor(index / BOARD_SIZE);
    const snakeIndex = snakeCells.get(`${x}:${y}`);
    const isFood = food.x === x && food.y === y;
    return (
      <span
        key={`${x}:${y}`}
        className={`snakeCell ${snakeIndex === 0 ? "snakeHead" : snakeIndex !== undefined ? "snakeBody" : ""} ${isFood ? "snakeFood" : ""}`}
      />
    );
  });

  return (
    <section className="snakeScreen" aria-label="Игра Змейка">
      <div className="snakeHeader">
        <div>
          <span>Geeks Game</span>
          <h1>Змейка</h1>
        </div>
        <div className="snakeStats">
          <span><small>Счёт</small>{score}</span>
          <span><small>Рекорд</small>{best}</span>
        </div>
      </div>

      <div
        className="snakeBoardWrap"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          const touch = event.changedTouches[0];
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
          steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
        }}
      >
        <div className="snakeBoard" role="img" aria-label={`Поле змейки. Счёт ${score}`}>
          {cells}
        </div>
        {phase !== "running" && (
          <div className="snakeOverlay">
            <strong>{phase === "over" ? "Игра окончена" : phase === "paused" ? "Пауза" : "Готов?"}</strong>
            <button type="button" onClick={phase === "paused" ? () => setPhase("running") : reset}>
              {phase === "paused" ? "Продолжить" : phase === "over" ? "Ещё раз" : "Играть"}
            </button>
          </div>
        )}
      </div>

      <div className="snakeControls" aria-label="Управление змейкой">
        <button type="button" className="up" aria-label="Вверх" onClick={() => steer("up")}>↑</button>
        <button type="button" className="left" aria-label="Влево" onClick={() => steer("left")}>←</button>
        <button type="button" className="down" aria-label="Вниз" onClick={() => steer("down")}>↓</button>
        <button type="button" className="right" aria-label="Вправо" onClick={() => steer("right")}>→</button>
      </div>
      <p className="snakeHint">Свайп или стрелки / WASD</p>
    </section>
  );
}
