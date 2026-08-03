"use client";

import { useEffect, useRef, useState } from "react";

const REWARDS = [10, 15, 20, 25, 30] as const;

type RewardBurst = {
  id: number;
  reward: number;
  drift: number;
};

type CapyTelegramWebApp = {
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium") => void;
  };
};

function telegramWebApp(): CapyTelegramWebApp | undefined {
  return (
    window as typeof window & {
      Telegram?: { WebApp?: CapyTelegramWebApp };
    }
  ).Telegram?.WebApp;
}

export function CapyClickerScreen() {
  const [coins, setCoins] = useState(0);
  const [taps, setTaps] = useState(0);
  const [bursts, setBursts] = useState<RewardBurst[]>([]);
  const [bopSide, setBopSide] = useState<0 | 1>(0);
  const coinsRef = useRef(0);
  const tapsRef = useRef(0);
  const burstId = useRef(0);

  useEffect(() => {
    const savedCoins = Number(window.localStorage.getItem("geeks-kapiklik-coins"));
    const savedTaps = Number(window.localStorage.getItem("geeks-kapiklik-taps"));
    const initialCoins = Number.isFinite(savedCoins) && savedCoins > 0 ? savedCoins : 0;
    const initialTaps = Number.isFinite(savedTaps) && savedTaps > 0 ? savedTaps : 0;

    coinsRef.current = initialCoins;
    tapsRef.current = initialTaps;
    setCoins(initialCoins);
    setTaps(initialTaps);
  }, []);

  function handleTap() {
    const reward = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    const id = ++burstId.current;
    const nextCoins = coinsRef.current + reward;
    const nextTaps = tapsRef.current + 1;

    coinsRef.current = nextCoins;
    tapsRef.current = nextTaps;
    setCoins(nextCoins);
    setTaps(nextTaps);
    setBopSide((side) => (side === 0 ? 1 : 0));
    setBursts((current) => [
      ...current.slice(-5),
      { id, reward, drift: Math.round(Math.random() * 76 - 38) },
    ]);

    window.localStorage.setItem("geeks-kapiklik-coins", String(nextCoins));
    window.localStorage.setItem("geeks-kapiklik-taps", String(nextTaps));

    const haptics = telegramWebApp()?.HapticFeedback;
    if (haptics?.impactOccurred) haptics.impactOccurred("medium");
    else if ("vibrate" in navigator) navigator.vibrate(18);

    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
    }, 850);
  }

  return (
    <section className="capyClickerScreen" aria-label="Игра КапиКлик">
      <div className="capyGameHeader">
        <div>
          <span>Geeks Game</span>
          <h1>КапиКлик</h1>
        </div>
        <div className="capyWallet" aria-label={`${coins} монет`}>
          <span className="capyCoin" aria-hidden="true">₽</span>
          <strong>{coins.toLocaleString("ru-RU")}</strong>
        </div>
      </div>

      <div className="capyGameCard">
        <div className="capyGameIntro">
          <span className="capyRewardPill">+10 — 30 за тап</span>
          <h2>Разбуди<br />капибару</h2>
          <p>Она делает вид, что спит. Жми без жалости.</p>
        </div>

        <div className={`capyCreatureWrap capyBop${bopSide}`} aria-hidden="true">
          <span className="capySpark capySparkOne">✦</span>
          <span className="capySpark capySparkTwo">✦</span>
          <div className="capyShadow" />
          <div className="capyCreature">
            <div className="capyEar capyEarLeft" />
            <div className="capyEar capyEarRight" />
            <div className="capyHead">
              <span className="capyTuft" />
              <span className="capyEye capyEyeLeft" />
              <span className="capyEye capyEyeRight" />
              <span className="capyCheek capyCheekLeft" />
              <span className="capyCheek capyCheekRight" />
              <div className="capyMuzzle">
                <span className="capyNostril capyNostrilLeft" />
                <span className="capyNostril capyNostrilRight" />
                <span className="capyMouth" />
              </div>
            </div>
            <div className="capyBody">
              <span className="capyPaw capyPawLeft" />
              <span className="capyPaw capyPawRight" />
            </div>
          </div>
        </div>

        <div className="capyActionZone">
          <div className="capyBurstLayer" aria-hidden="true">
            {bursts.map((burst) => (
              <span
                className="capyRewardBurst"
                key={burst.id}
                style={{ "--capy-drift": `${burst.drift}px` } as React.CSSProperties}
              >
                +{burst.reward} <span className="capyMiniCoin">₽</span>
              </span>
            ))}
          </div>

          <button className="capyTapButton" type="button" onClick={handleTap}>
            <span>ЖМИ</span>
            <small>получи монеты</small>
          </button>
          <p className="capyTapCount">Тапов: <strong>{taps.toLocaleString("ru-RU")}</strong></p>
          <span className="capySrOnly" aria-live="polite">Баланс: {coins} монет</span>
        </div>
      </div>
    </section>
  );
}
