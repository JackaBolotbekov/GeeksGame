import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AuthResponse, GameState, PlayerView } from "../shared/types";
import { useGameSocket } from "./use-game-socket";

interface AppConfig {
  telegramConfigured: boolean;
  devAuth: boolean;
}

interface ProfileState {
  displayName: string | null;
  avatarUrl: string | null;
  kind: "telegram" | "dev";
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Что-то пошло не так");
  return data as T;
}

function haptic(type: "success" | "error" | "light" | "heavy"): void {
  const feedback = window.Telegram?.WebApp.HapticFeedback;
  if (!feedback) return;
  if (type === "success" || type === "error") feedback.notificationOccurred(type);
  else feedback.impactOccurred(type);
}

export function App() {
  const [config, setConfig] = useState<AppConfig>({ telegramConfigured: false, devAuth: false });
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nameMode, setNameMode] = useState<"first" | "edit" | "dev" | null>(null);
  const [pendingPlayerClaim, setPendingPlayerClaim] = useState(false);
  const game = useGameSocket(sessionToken);
  const claimRole = game.claim;

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    telegram?.ready();
    telegram?.expand();

    const initialize = async () => {
      try {
        const loadedConfig = await api<AppConfig>("/api/config");
        setConfig(loadedConfig);
        if (telegram?.initData) {
          const result = await api<AuthResponse>("/api/auth/telegram", {
            method: "POST",
            body: JSON.stringify({ initData: telegram.initData }),
          });
          setSessionToken(result.sessionToken);
          setProfile(result.profile);
        }
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Не удалось выполнить вход");
      } finally {
        setAuthLoading(false);
      }
    };
    void initialize();
  }, []);

  useEffect(() => {
    if (!pendingPlayerClaim || !sessionToken || !game.connected || !profile?.displayName) return;
    void claimRole("player").then((result) => {
      if (result.ok) setPendingPlayerClaim(false);
    });
  }, [claimRole, game.connected, pendingPlayerClaim, profile?.displayName, sessionToken]);

  const claimHost = async () => {
    const result = await game.claim("host");
    haptic(result.ok ? "success" : "error");
  };

  const claimPlayer = async () => {
    if (profile?.displayName && sessionToken) {
      const result = await game.claim("player");
      haptic(result.ok ? "success" : "error");
      return;
    }
    if (profile?.kind === "telegram" && sessionToken) setNameMode("first");
    else if (config.devAuth) setNameMode("dev");
    else setAuthError("Откройте игру через Telegram-бота, чтобы занять место игрока");
  };

  const submitName = async (displayName: string) => {
    try {
      const result = nameMode === "dev"
        ? await api<AuthResponse>("/api/auth/dev", {
            method: "POST",
            body: JSON.stringify({ displayName }),
          })
        : await api<AuthResponse>("/api/profile", {
            method: "PATCH",
            headers: { Authorization: `Bearer ${sessionToken}` },
            body: JSON.stringify({ displayName }),
          });
      setSessionToken(result.sessionToken);
      setProfile(result.profile);
      setNameMode(null);
      if (nameMode === "dev" || nameMode === "first") setPendingPlayerClaim(true);
      haptic("success");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Не удалось сохранить имя");
      haptic("error");
    }
  };

  const release = async () => {
    await game.release();
    haptic("light");
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <Header
        connected={game.connected}
        profile={profile}
        onEditProfile={() => setNameMode("edit")}
      />

      <AnimatePresence mode="wait">
        {game.state.viewer.role === "none" ? (
          <RoleScreen
            key="roles"
            authLoading={authLoading}
            authError={authError}
            canPlay={Boolean(profile?.displayName && sessionToken) || config.devAuth}
            hostConnected={game.state.hostConnected}
            onHost={claimHost}
            onPlayer={claimPlayer}
          />
        ) : game.state.viewer.role === "host" ? (
          <HostScreen key="host" state={game.state} game={game} onRelease={release} />
        ) : game.state.viewer.role === "player" ? (
          <PlayerScreen key="player" state={game.state} game={game} onRelease={release} />
        ) : (
          <SpectatorScreen key="spectator" state={game.state} onRelease={release} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nameMode ? (
          <NameDialog
            key="name-dialog"
            initialValue={nameMode === "dev" ? "" : profile?.displayName ?? ""}
            required={nameMode !== "edit"}
            onClose={() => {
              if (nameMode === "edit" || nameMode === "dev") setNameMode(null);
            }}
            onSubmit={submitName}
          />
        ) : null}
        {game.message || authError ? (
          <Toast
            key="toast"
            message={game.message ?? authError ?? ""}
            onClose={() => {
              game.clearMessage();
              setAuthError(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function Header({
  connected,
  profile,
  onEditProfile,
}: {
  connected: boolean;
  profile: ProfileState | null;
  onEditProfile: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">G</span>
        <span>GEEKS<span>GAME</span></span>
      </div>
      <div className="topbar-actions">
        <span className={`connection ${connected ? "is-online" : ""}`}>
          <i />
          {connected ? "online" : "connecting"}
        </span>
        {profile?.kind === "telegram" && profile.displayName ? (
          <button className="icon-button" onClick={onEditProfile} aria-label="Изменить имя">
            ✎
          </button>
        ) : null}
      </div>
    </header>
  );
}

function RoleScreen({
  authLoading,
  authError,
  canPlay,
  hostConnected,
  onHost,
  onPlayer,
}: {
  authLoading: boolean;
  authError: string | null;
  canPlay: boolean;
  hostConnected: boolean;
  onHost: () => void;
  onPlayer: () => void;
}) {
  return (
    <motion.section
      className="role-screen"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
    >
      <div className="eyebrow">живая игра · 2 игрока · 1 ведущий</div>
      <h1>Угадай<br /><em>мелодию</em></h1>
      <p className="lead">Первый жмёт. Ведущий решает. Таблица переворачивается на глазах.</p>
      <div className="role-grid">
        <button className="role-card role-host" onClick={onHost} disabled={hostConnected}>
          <span className="role-number">01</span>
          <strong>{hostConnected ? "Ведущий уже в игре" : "Я ведущий"}</strong>
          <span>Управлять раундами и баллами</span>
          <b>→</b>
        </button>
        <button className="role-card role-player" onClick={onPlayer} disabled={authLoading || !canPlay}>
          <span className="role-number">02</span>
          <strong>{authLoading ? "Проверяем Telegram..." : "Я игрок"}</strong>
          <span>{canPlay ? "Занять место или попасть в очередь" : "Откройте через Telegram"}</span>
          <b>→</b>
        </button>
      </div>
      {authError ? <p className="inline-note">{authError}</p> : null}
      <div className="rules-strip">
        <span>Первый до <b>10</b></span>
        <span>Верно <b>+1</b></span>
        <span>Ошибка <b>−1</b></span>
      </div>
    </motion.section>
  );
}

type GameActions = ReturnType<typeof useGameSocket>;

function HostScreen({
  state,
  game,
  onRelease,
}: {
  state: GameState;
  game: GameActions;
  onRelease: () => void;
}) {
  return (
    <ScreenFrame
      kicker="Панель ведущего"
      title={state.winnerUserId ? "Матч завершён" : `Раунд ${state.round}`}
      onRelease={onRelease}
    >
      <div className="host-status">
        <span className={state.buzzerUserId ? "status-live" : ""}>
          {state.buzzerUserId ? "Есть ответ!" : "Ждём первый сигнал"}
        </span>
        <p>Нажмите левую или правую часть карточки любого игрока.</p>
      </div>
      <div className="host-cards">
        {state.players.length ? state.players.map((player) => (
          <HostPlayerCard
            key={player.userId}
            player={player}
            scoreEvent={state.scoreEvent}
            winner={state.winnerUserId === player.userId}
            onScore={(delta) => {
              haptic(delta === 1 ? "success" : "heavy");
              void game.score(player.userId, delta);
            }}
            onRemove={() => {
              if (window.confirm(`Освободить место игрока ${player.displayName}?`)) {
                void game.removePlayer(player.userId);
              }
            }}
          />
        )) : <EmptyPlayers />}
      </div>
      <div className="host-controls">
        <button onClick={() => void game.nextRound()} disabled={Boolean(state.winnerUserId)}>
          Новый раунд
        </button>
        <button
          className="danger-ghost"
          onClick={() => {
            if (window.confirm("Сбросить весь счёт и начать матч заново?")) void game.resetMatch();
          }}
        >
          Сбросить матч
        </button>
      </div>
      <WinnerOverlay state={state} />
    </ScreenFrame>
  );
}

function HostPlayerCard({
  player,
  scoreEvent,
  winner,
  onScore,
  onRemove,
}: {
  player: PlayerView;
  scoreEvent: GameState["scoreEvent"];
  winner: boolean;
  onScore: (delta: 1 | -1) => void;
  onRemove: () => void;
}) {
  return (
    <motion.article
      layout
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      className={`host-player-card ${player.isBuzzed ? "is-buzzed" : ""} ${winner ? "is-winner" : ""}`}
    >
      <button className="remove-player" aria-label={`Убрать ${player.displayName}`} onClick={onRemove}>×</button>
      <div className="host-player-main">
        <Avatar player={player} large />
        <div>
          <span className="micro-label">{player.isBuzzed ? "нажал первым" : winner ? "победитель" : "игрок"}</span>
          <h3>{player.displayName}</h3>
        </div>
        <Score value={player.score} event={scoreEvent?.userId === player.userId ? scoreEvent : null} />
      </div>
      <div className="score-actions">
        <button className="minus-zone" onClick={() => onScore(-1)} disabled={winner}>−1 <small>ошибка</small></button>
        <button className="plus-zone" onClick={() => onScore(1)} disabled={winner}>+1 <small>верно</small></button>
      </div>
    </motion.article>
  );
}

function PlayerScreen({
  state,
  game,
  onRelease,
}: {
  state: GameState;
  game: GameActions;
  onRelease: () => void;
}) {
  const me = state.players.find((player) => player.userId === state.viewer.userId);
  const isLocked = Boolean(state.buzzerUserId || state.winnerUserId);
  const pressedMe = state.buzzerUserId === state.viewer.userId;

  return (
    <ScreenFrame
      kicker={me ? `Играет ${me.displayName}` : "Игровой экран"}
      title={state.winnerUserId ? "Финиш!" : `Раунд ${state.round}`}
      onRelease={onRelease}
    >
      <Scoreboard state={state} />
      <Waveform active={!isLocked} />
      <div className="buzzer-wrap">
        <motion.button
          className={`buzzer ${pressedMe ? "is-pressed" : ""}`}
          whileTap={{ scale: 0.94 }}
          disabled={isLocked}
          onClick={() => {
            haptic("heavy");
            void game.buzz();
          }}
        >
          <span className="buzzer-hand">✋</span>
          <strong>{pressedMe ? "Ты первый!" : state.buzzerUserId ? "Уже нажали" : "Знаю ответ"}</strong>
        </motion.button>
      </div>
      <WinnerOverlay state={state} />
    </ScreenFrame>
  );
}

function SpectatorScreen({ state, onRelease }: { state: GameState; onRelease: () => void }) {
  return (
    <ScreenFrame kicker="Режим зрителя" title={`Раунд ${state.round}`} onRelease={onRelease}>
      <div className="queue-banner">
        <span>Вы в очереди</span>
        <strong>#{state.viewer.queuePosition}</strong>
        <p>Как только место освободится, вы автоматически станете игроком.</p>
      </div>
      <Scoreboard state={state} />
      <Waveform active={!state.buzzerUserId && !state.winnerUserId} />
      <WinnerOverlay state={state} />
    </ScreenFrame>
  );
}

function ScreenFrame({
  kicker,
  title,
  onRelease,
  children,
}: {
  kicker: string;
  title: string;
  onRelease: () => void;
  children: ReactNode;
}) {
  return (
    <motion.section
      className="game-screen"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
    >
      <div className="screen-heading">
        <div>
          <span className="eyebrow">{kicker}</span>
          <h2>{title}</h2>
        </div>
        <button className="exit-button" onClick={onRelease}>Выйти</button>
      </div>
      {children}
    </motion.section>
  );
}

function Scoreboard({ state }: { state: GameState }) {
  return (
    <motion.div className="scoreboard" layout>
      {state.players.length ? state.players.map((player, index) => (
        <motion.article
          className={`score-row ${player.isBuzzed ? "is-buzzed" : ""}`}
          key={player.userId}
          layout
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        >
          <span className="place">{index + 1}</span>
          <Avatar player={player} />
          <div className="score-name">
            <strong>{player.displayName}</strong>
            <span>{player.isBuzzed ? "нажал первым" : state.winnerUserId === player.userId ? "победитель" : "в игре"}</span>
          </div>
          <Score value={player.score} event={state.scoreEvent?.userId === player.userId ? state.scoreEvent : null} />
        </motion.article>
      )) : <EmptyPlayers />}
    </motion.div>
  );
}

function Avatar({ player, large = false }: { player: PlayerView; large?: boolean }) {
  const initials = player.displayName.slice(0, 2).toUpperCase();
  const hue = useMemo(
    () => [...player.userId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360,
    [player.userId],
  );
  return player.avatarUrl ? (
    <img className={`avatar ${large ? "is-large" : ""}`} src={player.avatarUrl} alt="" />
  ) : (
    <span className={`avatar avatar-fallback ${large ? "is-large" : ""}`} style={{ "--avatar-hue": hue } as React.CSSProperties}>
      {initials}
    </span>
  );
}

function Score({ value, event }: { value: number; event: GameState["scoreEvent"] }) {
  return (
    <div className="score-value">
      <strong>{value}</strong>
      <AnimatePresence>
        {event ? (
          <motion.span
            key={event.id}
            className={event.delta > 0 ? "score-fly plus" : "score-fly minus"}
            initial={{ opacity: 0, y: 12, scale: 0.7 }}
            animate={{ opacity: [0, 1, 0], y: [12, -18, -34], scale: [0.7, 1, 1.1] }}
            transition={{ duration: 0.9, times: [0, 0.35, 1] }}
          >
            {event.delta > 0 ? "+1" : "−1"}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  const bars = [18, 36, 26, 54, 30, 42, 72, 34, 56, 25, 64, 40, 76, 30, 48, 22, 58, 38, 68, 28, 44];
  return (
    <div className={`waveform ${active ? "is-active" : ""}`} aria-hidden="true">
      {bars.map((height, index) => <i key={index} style={{ height, animationDelay: `${index * -70}ms` }} />)}
    </div>
  );
}

function EmptyPlayers() {
  return (
    <div className="empty-players">
      <span>♪</span>
      <strong>Ждём игроков</strong>
      <p>Два первых участника появятся здесь автоматически.</p>
    </div>
  );
}

function WinnerOverlay({ state }: { state: GameState }) {
  const winner = state.players.find((player) => player.userId === state.winnerUserId);
  return (
    <AnimatePresence>
      {winner ? (
        <motion.div
          className="winner-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="winner-card"
            initial={{ scale: 0.7, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 18 }}
          >
            <span className="winner-crown">♛</span>
            <span className="eyebrow">Первый до десяти</span>
            <h2>{winner.displayName}</h2>
            <p>побеждает со счётом <strong>{winner.score}</strong></p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function NameDialog({
  initialValue,
  required,
  onClose,
  onSubmit,
}: {
  initialValue: string;
  required: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await onSubmit(name.trim());
    setSaving(false);
  };
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="name-dialog"
        onSubmit={submit}
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
      >
        <span className="eyebrow">Твоя игровая карточка</span>
        <h2>Как тебя назвать?</h2>
        <p>Это имя сохранится и будет ждать тебя в следующей игре.</p>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={24}
          placeholder="Имя или ник"
          aria-label="Имя или ник"
          required
        />
        <button className="primary-button" disabled={saving || name.trim().length < 2}>
          {saving ? "Сохраняем..." : "В игру →"}
        </button>
        {!required ? <button type="button" className="text-button" onClick={onClose}>Отмена</button> : null}
      </motion.form>
    </motion.div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return (
    <motion.button
      className="toast"
      onClick={onClose}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {message}
    </motion.button>
  );
}
