import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AuthResponse, GameState, MusicPlayback, PlayerView, YouTubePlaylist, YouTubeTrack } from "../shared/types";
import { useGameSocket } from "./use-game-socket";

interface AppConfig {
  telegramConfigured: boolean;
  devAuth: boolean;
  youtubeConfigured: boolean;
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

const SHOUT_DB_NAME = "geeksgame-shout";
const SHOUT_STORE_NAME = "clips";
const SHOUT_KEY = "player-shout";
let youtubeApiPromise: Promise<void> | null = null;

function openShoutDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHOUT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SHOUT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadShoutBlob(): Promise<Blob | null> {
  if (!("indexedDB" in window)) return null;
  const db = await openShoutDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOUT_STORE_NAME, "readonly");
    const request = transaction.objectStore(SHOUT_STORE_NAME).get(SHOUT_KEY);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function saveShoutBlob(blob: Blob): Promise<void> {
  const db = await openShoutDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SHOUT_STORE_NAME, "readwrite");
    transaction.objectStore(SHOUT_STORE_NAME).put(blob, SHOUT_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteShoutBlob(): Promise<void> {
  const db = await openShoutDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SHOUT_STORE_NAME, "readwrite");
    transaction.objectStore(SHOUT_STORE_NAME).delete(SHOUT_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function playFallbackShout(): void {
  try {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(780, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  } catch {
    // Some Telegram WebViews can block WebAudio; haptics still gives feedback.
  }
}

async function playStoredShout(): Promise<void> {
  try {
    const blob = await loadShoutBlob();
    if (!blob) {
      playFallbackShout();
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    playFallbackShout();
  }
}

function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.append(script);
  });
  return youtubeApiPromise;
}

export function App() {
  const [config, setConfig] = useState<AppConfig>({
    telegramConfigured: false,
    devAuth: false,
    youtubeConfigured: false,
  });
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nameMode, setNameMode] = useState<"first" | "edit" | "dev" | null>(null);
  const [shoutSettingsOpen, setShoutSettingsOpen] = useState(false);
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

  const playShout = useCallback(async () => {
    await playStoredShout();
  }, []);

  return (
    <main className={`app-shell viewer-role-${game.state.viewer.role}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <Header
        connected={game.connected}
        profile={profile}
        onEditProfile={() => setNameMode("edit")}
        onShoutSettings={() => setShoutSettingsOpen(true)}
      />

      <AnimatePresence mode="wait">
        {game.state.viewer.role === "none" ? (
          <RoleScreen
            key="roles"
            authLoading={authLoading}
            authError={authError}
            canPlay={Boolean(profile && sessionToken) || config.devAuth}
            hostConnected={game.state.hostConnected}
            onHost={claimHost}
            onPlayer={claimPlayer}
          />
        ) : game.state.viewer.role === "host" ? (
          <HostScreen
            key="host"
            state={game.state}
            game={game}
            youtubeConfigured={config.youtubeConfigured}
            onRelease={release}
          />
        ) : game.state.viewer.role === "player" ? (
          <PlayerScreen
            key="player"
            state={game.state}
            game={game}
            onRelease={release}
            onBuzzSuccess={playShout}
          />
        ) : (
          <SpectatorScreen key="spectator" state={game.state} onRelease={release} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nameMode ? (
          <NameDialog
            key="name-dialog"
            initialValue={nameMode === "dev" ? "" : profile?.displayName ?? ""}
            profile={profile}
            required={nameMode !== "edit"}
            onClose={() => {
              if (nameMode === "edit" || nameMode === "dev") setNameMode(null);
            }}
            onSubmit={submitName}
          />
        ) : null}
        {shoutSettingsOpen ? (
          <ShoutDialog key="shout-dialog" onClose={() => setShoutSettingsOpen(false)} />
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
  onShoutSettings,
}: {
  connected: boolean;
  profile: ProfileState | null;
  onEditProfile: () => void;
  onShoutSettings: () => void;
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
        {profile?.displayName ? (
          <button className="icon-button" onClick={onShoutSettings} aria-label="Мой выкрик">
            🔊
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
      <div className="eyebrow">живая игра · до 4 игроков · 1 ведущий</div>
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

const YOUTUBE_QUICK_SEARCHES = [
  { label: "Все", query: "популярные песни" },
  { label: "Музыка", query: "музыка хиты" },
  { label: "Джемы", query: "live jam session music" },
  { label: "Топ-чарты", query: "топ чарты музыка" },
  { label: "2000-е", query: "хиты 2000 русские" },
  { label: "2010-е", query: "хиты 2010 русские" },
  { label: "Black Star", query: "Black Star хиты" },
  { label: "Gazgolder", query: "Gazgolder хиты" },
];

function HostScreen({
  state,
  game,
  youtubeConfigured,
  onRelease,
}: {
  state: GameState;
  game: GameActions;
  youtubeConfigured: boolean;
  onRelease: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<"search" | "playlist" | null>(null);
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [playlistAdminUnlocked, setPlaylistAdminUnlocked] = useState(false);
  const [playlistPin, setPlaylistPin] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistMessage, setPlaylistMessage] = useState<string | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<YouTubePlaylist | null>(null);
  const activeSearchRef = useRef("");
  const activePlaylistRef = useRef("");
  const setMusicState = game.setMusicState;
  const listPlaylists = game.listPlaylists;
  const handleMusicState = useCallback((playback: MusicPlayback) => {
    void setMusicState(playback);
  }, [setMusicState]);
  useEffect(() => {
    let cancelled = false;
    void listPlaylists().then((response) => {
      if (!cancelled && response.ok) setPlaylists(response.playlists ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [listPlaylists]);
  const searchTracks = async (searchQuery: string, pageToken?: string | null) => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) return;
    const isNextPage = Boolean(pageToken);
    setQuery(trimmedQuery);
    activeSearchRef.current = trimmedQuery;
    setResultMode("search");
    if (!isNextPage) setSelectedPlaylist(null);
    if (isNextPage) setLoadingMore(true);
    else {
      setSearching(true);
      setNextPageToken(null);
    }
    setSearchMessage(null);
    const response = await game.youtubeSearch(trimmedQuery, pageToken);
    if (activeSearchRef.current !== trimmedQuery) return;
    if (isNextPage) setLoadingMore(false);
    else setSearching(false);
    if (response.ok) {
      const nextResults = response.results ?? [];
      setResults((currentResults) => {
        if (!isNextPage) return nextResults;
        const seen = new Set(currentResults.map((item) => item.videoId));
        return [...currentResults, ...nextResults.filter((item) => !seen.has(item.videoId))];
      });
      setNextPageToken(response.nextPageToken ?? null);
      if (!response.results?.length) setSearchMessage("Ничего не нашли");
    } else {
      setSearchMessage(response.message ?? "Не удалось найти песню");
    }
  };
  const loadPlaylistTracks = async (playlist: YouTubePlaylist, pageToken?: string | null) => {
    const isNextPage = Boolean(pageToken);
    activePlaylistRef.current = playlist.id;
    setSelectedPlaylist(playlist);
    setResultMode("playlist");
    setSearchMessage(null);
    if (isNextPage) setLoadingMore(true);
    else {
      setPlaylistLoading(true);
      setNextPageToken(null);
      setResults([]);
    }
    const response = await game.loadPlaylistItems(playlist.id, pageToken);
    if (activePlaylistRef.current !== playlist.id) return;
    if (isNextPage) setLoadingMore(false);
    else setPlaylistLoading(false);
    if (response.ok) {
      const nextResults = response.results ?? [];
      setResults((currentResults) => {
        if (!isNextPage) return nextResults;
        const seen = new Set(currentResults.map((item) => item.videoId));
        return [...currentResults, ...nextResults.filter((item) => !seen.has(item.videoId))];
      });
      setNextPageToken(response.nextPageToken ?? null);
      if (!response.results?.length) setSearchMessage("В плейлисте нет доступных треков");
    } else {
      setSearchMessage(response.message ?? "Не удалось загрузить плейлист");
    }
  };
  const unlockPlaylistAdmin = async (event: FormEvent) => {
    event.preventDefault();
    const response = await game.unlockPlaylistAdmin(playlistPin);
    if (response.ok) {
      setPlaylistAdminUnlocked(true);
      setPlaylistPin("");
      setPlaylistMessage("Админка плейлистов открыта");
    } else {
      setPlaylistMessage(response.message ?? "Не удалось открыть админку");
    }
  };
  const addPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    setPlaylistMessage(null);
    const response = await game.addPlaylist(playlistUrl, playlistTitle || null);
    if (response.ok) {
      setPlaylists(response.playlists ?? []);
      setPlaylistUrl("");
      setPlaylistTitle("");
      setPlaylistMessage("Плейлист сохранён");
    } else {
      setPlaylistMessage(response.message ?? "Не удалось сохранить плейлист");
    }
  };
  const deletePlaylist = async (playlist: YouTubePlaylist) => {
    if (!window.confirm(`Удалить плейлист ${playlist.title}?`)) return;
    const response = await game.deletePlaylist(playlist.id);
    if (response.ok) {
      setPlaylists(response.playlists ?? []);
      if (selectedPlaylist?.id === playlist.id) {
        setSelectedPlaylist(null);
        setResultMode(null);
        setResults([]);
        setNextPageToken(null);
      }
    } else {
      setPlaylistMessage(response.message ?? "Не удалось удалить плейлист");
    }
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void searchTracks(query);
  };

  return (
    <ScreenFrame
      variant="host"
      kicker="Панель ведущего"
      title={state.winnerUserId ? "Матч завершён" : `Раунд ${state.round}`}
      onRelease={onRelease}
      className={state.answerAttempt ? "has-answer-attempt" : ""}
    >
      <div className="host-stage">
        <div className="host-stage-music">
          <HostMusicPanel
            state={state}
            query={query}
            results={results}
            searching={searching}
            loadingMore={loadingMore}
            playlistLoading={playlistLoading}
            hasMoreResults={Boolean(nextPageToken)}
            searchMessage={searchMessage}
            youtubeConfigured={youtubeConfigured}
            playlists={playlists}
            playlistAdminUnlocked={playlistAdminUnlocked}
            playlistPin={playlistPin}
            playlistUrl={playlistUrl}
            playlistTitle={playlistTitle}
            playlistMessage={playlistMessage}
            selectedPlaylistId={selectedPlaylist?.id ?? null}
            onQueryChange={setQuery}
            onSearch={submitSearch}
            onQuickSearch={(searchQuery) => void searchTracks(searchQuery)}
            onPlaylistPinChange={setPlaylistPin}
            onPlaylistUrlChange={setPlaylistUrl}
            onPlaylistTitleChange={setPlaylistTitle}
            onPlaylistAdminUnlock={unlockPlaylistAdmin}
            onPlaylistAdd={addPlaylist}
            onPlaylistOpen={(playlist) => void loadPlaylistTracks(playlist)}
            onPlaylistDelete={(playlist) => void deletePlaylist(playlist)}
            onLoadMore={() => {
              if (!nextPageToken || searching || loadingMore) return;
              if (resultMode === "playlist" && selectedPlaylist) void loadPlaylistTracks(selectedPlaylist, nextPageToken);
              else void searchTracks(query, nextPageToken);
            }}
            onSelectTrack={(track) => {
              void game.selectTrack(track);
            }}
            onMusicState={handleMusicState}
          />
        </div>
        <div className="host-stage-game">
          <div className="host-status">
            <span className={state.answerAttempt ? "status-live" : ""}>
              {state.answerAttempt ? "Есть ответ!" : "Ждём первый сигнал"}
            </span>
            <p>
              {state.answerAttempt
                ? "Музыка на паузе. Оцените ответ активного игрока."
                : "Нажмите левую или правую часть карточки любого игрока."}
            </p>
            <AnswerTimer attempt={state.answerAttempt} />
          </div>
          <div className="host-cards" data-player-count={state.players.length}>
            {state.players.length ? state.players.map((player) => (
              <HostPlayerCard
                key={player.userId}
                player={player}
                scoreEvent={state.scoreEvent}
                winner={state.winnerUserId === player.userId}
                activeAttemptUserId={state.answerAttempt?.userId ?? null}
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
        </div>
      </div>
      <WinnerOverlay state={state} />
    </ScreenFrame>
  );
}

function HostMusicPanel({
  state,
  query,
  results,
  searching,
  loadingMore,
  playlistLoading,
  hasMoreResults,
  searchMessage,
  youtubeConfigured,
  playlists,
  playlistAdminUnlocked,
  playlistPin,
  playlistUrl,
  playlistTitle,
  playlistMessage,
  selectedPlaylistId,
  onQueryChange,
  onSearch,
  onQuickSearch,
  onPlaylistPinChange,
  onPlaylistUrlChange,
  onPlaylistTitleChange,
  onPlaylistAdminUnlock,
  onPlaylistAdd,
  onPlaylistOpen,
  onPlaylistDelete,
  onLoadMore,
  onSelectTrack,
  onMusicState,
}: {
  state: GameState;
  query: string;
  results: YouTubeTrack[];
  searching: boolean;
  loadingMore: boolean;
  playlistLoading: boolean;
  hasMoreResults: boolean;
  searchMessage: string | null;
  youtubeConfigured: boolean;
  playlists: YouTubePlaylist[];
  playlistAdminUnlocked: boolean;
  playlistPin: string;
  playlistUrl: string;
  playlistTitle: string;
  playlistMessage: string | null;
  selectedPlaylistId: string | null;
  onQueryChange: (query: string) => void;
  onSearch: (event: FormEvent) => void;
  onQuickSearch: (query: string) => void;
  onPlaylistPinChange: (pin: string) => void;
  onPlaylistUrlChange: (url: string) => void;
  onPlaylistTitleChange: (title: string) => void;
  onPlaylistAdminUnlock: (event: FormEvent) => void;
  onPlaylistAdd: (event: FormEvent) => void;
  onPlaylistOpen: (playlist: YouTubePlaylist) => void;
  onPlaylistDelete: (playlist: YouTubePlaylist) => void;
  onLoadMore: () => void;
  onSelectTrack: (track: YouTubeTrack) => void;
  onMusicState: (playback: MusicPlayback) => void;
}) {
  return (
    <section
      className="host-music-panel youtube-browser"
      onScroll={(event) => {
        const target = event.currentTarget;
        if (!hasMoreResults || loadingMore || searching) return;
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 240) onLoadMore();
      }}
    >
      <div className="music-search-panel">
        <div className="youtube-browser-top">
          <div className="youtube-wordmark" aria-hidden="true">
            <span>▶</span>
            <strong>YouTube</strong>
          </div>
          <form className="music-search" onSubmit={onSearch}>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={youtubeConfigured ? "Найти песню в YouTube" : "Нужен YOUTUBE_API_KEY"}
              aria-label="Найти песню в YouTube"
              disabled={!youtubeConfigured}
            />
            <button disabled={!youtubeConfigured || searching || query.trim().length < 2}>
              {searching ? "Ищем..." : "Найти"}
            </button>
          </form>
          <span className="youtube-browser-caption">поиск · джемы · рекомендации</span>
        </div>
        <div className="youtube-topic-chips" aria-label="Быстрые подборки YouTube">
          {YOUTUBE_QUICK_SEARCHES.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onQuickSearch(item.query)}
              disabled={!youtubeConfigured || searching}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="youtube-browser-body">
        <aside className="youtube-side-nav" aria-label="Разделы YouTube">
          <span className="is-active">Главная</span>
          <span>Shorts</span>
          <span>Музыка</span>
          <span>Джемы</span>
          <span>Топ-чарты</span>
          <span>Плейлисты</span>
        </aside>
        <div className="youtube-main-feed">
          <div className="music-player-shell">
            <YouTubePlayer
              track={state.track}
              playback={state.musicPlayback}
              shouldPause={Boolean(state.answerAttempt)}
              onPlaybackChange={onMusicState}
            />
          </div>
          <PlaylistPanel
            playlists={playlists}
            adminUnlocked={playlistAdminUnlocked}
            pin={playlistPin}
            url={playlistUrl}
            title={playlistTitle}
            message={playlistMessage}
            selectedPlaylistId={selectedPlaylistId}
            loading={playlistLoading}
            youtubeConfigured={youtubeConfigured}
            onPinChange={onPlaylistPinChange}
            onUrlChange={onPlaylistUrlChange}
            onTitleChange={onPlaylistTitleChange}
            onUnlock={onPlaylistAdminUnlock}
            onAdd={onPlaylistAdd}
            onOpen={onPlaylistOpen}
            onDelete={onPlaylistDelete}
          />
          {searchMessage ? <p className="music-search-message">{searchMessage}</p> : null}
          {results.length ? (
            <div className="music-results">
              {results.map((track) => (
                <button
                  key={track.videoId}
                  className={state.track?.videoId === track.videoId ? "is-selected" : ""}
                  onClick={() => onSelectTrack(track)}
                >
                  {track.thumbnailUrl ? <img src={track.thumbnailUrl} alt="" /> : <span>♪</span>}
                  <strong>{track.title}</strong>
                  <small>{track.channelTitle}</small>
                </button>
              ))}
              {hasMoreResults || loadingMore ? (
                <button
                  className="music-load-more"
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Подгружаем..." : "Показать ещё"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="music-quick-grid">
              {YOUTUBE_QUICK_SEARCHES.slice(1).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onQuickSearch(item.query)}
                  disabled={!youtubeConfigured || searching}
                >
                  <span className="quick-thumb" aria-hidden="true">
                    <span>▶</span>
                  </span>
                  <span className="quick-copy">
                    <strong>{item.label}</strong>
                    <small>{item.query}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PlaylistPanel({
  playlists,
  adminUnlocked,
  pin,
  url,
  title,
  message,
  selectedPlaylistId,
  loading,
  youtubeConfigured,
  onPinChange,
  onUrlChange,
  onTitleChange,
  onUnlock,
  onAdd,
  onOpen,
  onDelete,
}: {
  playlists: YouTubePlaylist[];
  adminUnlocked: boolean;
  pin: string;
  url: string;
  title: string;
  message: string | null;
  selectedPlaylistId: string | null;
  loading: boolean;
  youtubeConfigured: boolean;
  onPinChange: (pin: string) => void;
  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;
  onUnlock: (event: FormEvent) => void;
  onAdd: (event: FormEvent) => void;
  onOpen: (playlist: YouTubePlaylist) => void;
  onDelete: (playlist: YouTubePlaylist) => void;
}) {
  return (
    <section className={`playlist-panel ${playlists.length ? "has-playlists" : "is-empty"} ${adminUnlocked ? "is-unlocked" : "is-locked"}`}>
      <div className="playlist-panel-head">
        <div>
          <span>Мои плейлисты</span>
          <strong>{playlists.length ? `${playlists.length} сохранено` : "добавьте YouTube playlist"}</strong>
        </div>
        {loading ? <small>загружаем треки...</small> : null}
      </div>
      {!adminUnlocked ? (
        <form className="playlist-admin-form" onSubmit={onUnlock}>
          <input
            value={pin}
            onChange={(event) => onPinChange(event.target.value)}
            placeholder="HOST_ADMIN_PIN"
            aria-label="PIN админки плейлистов"
            type="password"
            autoComplete="off"
          />
          <button type="submit">Открыть плейлисты</button>
        </form>
      ) : (
        <form className="playlist-add-form" onSubmit={onAdd}>
          <input
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="Ссылка на YouTube playlist"
            aria-label="Ссылка на YouTube плейлист"
            disabled={!youtubeConfigured}
          />
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Название, если нужно"
            aria-label="Название плейлиста"
            disabled={!youtubeConfigured}
          />
          <button type="submit" disabled={!youtubeConfigured || url.trim().length < 10}>
            Сохранить плейлист
          </button>
        </form>
      )}
      {message ? <p className="playlist-message">{message}</p> : null}
      {playlists.length ? (
        <div className="playlist-grid">
          {playlists.map((playlist) => (
            <article
              className={`playlist-card-wrap ${selectedPlaylistId === playlist.id ? "is-selected" : ""}`}
              key={playlist.id}
            >
              <button className="playlist-card" type="button" onClick={() => onOpen(playlist)}>
                {playlist.thumbnailUrl ? <img src={playlist.thumbnailUrl} alt="" /> : <span>▶</span>}
                <strong>{playlist.title}</strong>
                <small>{playlist.itemCount === null ? "треков пока не знаем" : `${playlist.itemCount} треков`}</small>
              </button>
              {adminUnlocked ? (
                <button
                  className="playlist-delete"
                  type="button"
                  aria-label={`Удалить плейлист ${playlist.title}`}
                  onClick={() => onDelete(playlist)}
                >
                  ×
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="playlist-empty">Пока нет сохранённых плейлистов. Вставьте public или unlisted ссылку.</p>
      )}
    </section>
  );
}

type YouTubePlayerInstance = {
  playVideo(): void;
  pauseVideo(): void;
  cueVideoById(videoId: string): void;
  destroy(): void;
};

function YouTubePlayer({
  track,
  playback,
  shouldPause,
  onPlaybackChange,
}: {
  track: YouTubeTrack | null;
  playback: MusicPlayback;
  shouldPause: boolean;
  onPlaybackChange: (playback: MusicPlayback) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const videoId = track?.videoId;

  useEffect(() => {
    if (!videoId || !containerRef.current) return;
    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT?.Player || !containerRef.current) return;
      if (playerRef.current) {
        playerRef.current.cueVideoById(videoId);
        setReady(true);
        return;
      }
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (event) => {
            const playerState = window.YT?.PlayerState;
            if (!playerState) return;
            if (event.data === playerState.PLAYING) onPlaybackChange("playing");
            if (event.data === playerState.PAUSED) onPlaybackChange("paused");
            if (event.data === playerState.ENDED) onPlaybackChange("idle");
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [onPlaybackChange, videoId]);

  useEffect(() => {
    if (videoId) return;
    playerRef.current?.destroy();
    playerRef.current = null;
  }, [videoId]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (shouldPause && playerRef.current) {
      playerRef.current.pauseVideo();
      onPlaybackChange("paused");
    }
  }, [onPlaybackChange, shouldPause]);

  return (
    <div className={`youtube-player-card ${track ? "has-track" : ""}`}>
      <div className="youtube-frame">
        {track ? <div ref={containerRef} /> : <div className="youtube-placeholder">Выберите песню</div>}
      </div>
      <div className="youtube-controls">
        <TrackTicker track={track} playback={playback} />
        <div>
          <button
            onClick={() => {
              playerRef.current?.playVideo();
              onPlaybackChange("playing");
            }}
            disabled={!track || !ready || shouldPause}
          >
            Играть
          </button>
          <button
            onClick={() => {
              playerRef.current?.pauseVideo();
              onPlaybackChange("paused");
            }}
            disabled={!track || !ready}
          >
            Пауза
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackTicker({ track, playback }: { track: YouTubeTrack | null; playback: MusicPlayback }) {
  return (
    <div className="track-ticker">
      <span className={`music-dot is-${playback}`} />
      <div>
        <small>{playback === "playing" ? "играет" : playback === "paused" ? "пауза" : "трек"}</small>
        <strong>{track ? track.title : "Песня не выбрана"}</strong>
      </div>
    </div>
  );
}

function AnswerTimer({ attempt }: { attempt: GameState["answerAttempt"] }) {
  const [now, setNow] = useState(attempt?.startedAt ?? 0);
  useEffect(() => {
    if (!attempt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [attempt?.startedAt, attempt]);
  if (!attempt) return null;
  const displayNow = Math.max(now, attempt.startedAt);
  const remaining = Math.max(0, Math.ceil((attempt.deadlineAt - displayNow) / 1000));
  return (
    <div className="answer-timer" aria-label="Таймер ответа">
      <strong>{remaining}</strong>
      <span>сек</span>
    </div>
  );
}

function AnswerBanner({
  attempt,
  players,
  viewerUserId,
}: {
  attempt: GameState["answerAttempt"];
  players: PlayerView[];
  viewerUserId: string | null;
}) {
  if (!attempt) return null;
  const player = players.find((item) => item.userId === attempt.userId);
  const isMe = viewerUserId === attempt.userId;
  return (
    <div className={`answer-banner ${isMe ? "is-me" : ""}`}>
      <span>{isMe ? "Твой ответ" : "Отвечает"}</span>
      <strong>{player?.displayName ?? "Игрок"}</strong>
      <AnswerTimer attempt={attempt} />
    </div>
  );
}

function HostPlayerCard({
  player,
  scoreEvent,
  winner,
  activeAttemptUserId,
  onScore,
  onRemove,
}: {
  player: PlayerView;
  scoreEvent: GameState["scoreEvent"];
  winner: boolean;
  activeAttemptUserId: string | null;
  onScore: (delta: 1 | -1) => void;
  onRemove: () => void;
}) {
  const lockedByAnotherAnswer = Boolean(activeAttemptUserId && activeAttemptUserId !== player.userId);
  return (
    <motion.article
      layout
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      className={`host-player-card ${player.isBuzzed ? "is-buzzed" : ""} ${winner ? "is-winner" : ""} ${player.isAnswering ? "is-answering" : ""} ${player.hasAttemptedThisRound && !player.isAnswering ? "has-attempted" : ""}`}
    >
      <button className="remove-player" aria-label={`Убрать ${player.displayName}`} onClick={onRemove}>×</button>
      <div className="host-player-main">
        <Avatar player={player} large />
        <div>
          <span className="micro-label">
            {player.isAnswering
              ? "отвечает сейчас"
              : player.hasAttemptedThisRound
                ? "уже отвечал"
                : player.isBuzzed
                  ? "нажал первым"
                  : winner ? "победитель" : "игрок"}
          </span>
          <h3>{player.displayName}</h3>
        </div>
        <Score value={player.score} event={scoreEvent?.userId === player.userId ? scoreEvent : null} />
      </div>
      <div className="score-actions">
        <button className="minus-zone" onClick={() => onScore(-1)} disabled={winner || lockedByAnotherAnswer}>−1 <small>ошибка</small></button>
        <button className="plus-zone" onClick={() => onScore(1)} disabled={winner || lockedByAnotherAnswer}>+1 <small>верно</small></button>
      </div>
    </motion.article>
  );
}

function PlayerScreen({
  state,
  game,
  onRelease,
  onBuzzSuccess,
}: {
  state: GameState;
  game: GameActions;
  onRelease: () => void;
  onBuzzSuccess: () => Promise<void>;
}) {
  const me = state.players.find((player) => player.userId === state.viewer.userId);
  const isLocked = Boolean(state.answerAttempt || state.winnerUserId);
  const pressedMe = state.answerAttempt?.userId === state.viewer.userId;
  const alreadyAnswered = Boolean(me?.hasAttemptedThisRound && !pressedMe);
  const buttonLabel = pressedMe
    ? "Твой ответ!"
    : alreadyAnswered
      ? "Уже отвечал"
      : state.answerAttempt
        ? "Ждём ответ"
        : "Знаю ответ";

  return (
    <ScreenFrame
      variant="player"
      kicker={me ? `Играет ${me.displayName}` : "Игровой экран"}
      title={state.winnerUserId ? "Финиш!" : `Раунд ${state.round}`}
      onRelease={onRelease}
      className={state.answerAttempt ? "has-answer-attempt" : ""}
    >
      <TrackTicker track={state.track} playback={state.musicPlayback} />
      <Scoreboard state={state} />
      <AnswerBanner attempt={state.answerAttempt} players={state.players} viewerUserId={state.viewer.userId} />
      <Waveform active={state.musicPlayback === "playing" && !isLocked} />
      <div className="buzzer-wrap">
        <motion.button
          className={`buzzer ${pressedMe ? "is-pressed" : ""}`}
          whileTap={{ scale: 0.94 }}
          disabled={isLocked}
          onClick={async () => {
            haptic("heavy");
            const result = await game.buzz();
            if (result.ok) await onBuzzSuccess();
          }}
        >
          <span className="buzzer-hand">✋</span>
          <strong>{buttonLabel}</strong>
        </motion.button>
      </div>
      <WinnerOverlay state={state} />
    </ScreenFrame>
  );
}

function SpectatorScreen({ state, onRelease }: { state: GameState; onRelease: () => void }) {
  return (
    <ScreenFrame variant="spectator" kicker="Режим зрителя" title={`Раунд ${state.round}`} onRelease={onRelease}>
      <TrackTicker track={state.track} playback={state.musicPlayback} />
      <div className="queue-banner">
        <span>Вы в очереди</span>
        <strong>#{state.viewer.queuePosition}</strong>
        <p>Как только место освободится, вы автоматически станете игроком.</p>
      </div>
      <Scoreboard state={state} />
      <AnswerBanner attempt={state.answerAttempt} players={state.players} viewerUserId={state.viewer.userId} />
      <Waveform active={state.musicPlayback === "playing" && !state.answerAttempt && !state.winnerUserId} />
      <WinnerOverlay state={state} />
    </ScreenFrame>
  );
}

function ScreenFrame({
  variant,
  kicker,
  title,
  onRelease,
  children,
  className = "",
}: {
  variant: "host" | "player" | "spectator";
  kicker: string;
  title: string;
  onRelease: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      className={["game-screen", `${variant}-screen`, className].filter(Boolean).join(" ")}
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
    <motion.div className="scoreboard" layout data-player-count={state.players.length}>
      {state.players.length ? state.players.map((player, index) => (
        <motion.article
          className={`score-row ${player.isBuzzed ? "is-buzzed" : ""} ${player.isAnswering ? "is-answering" : ""} ${player.hasAttemptedThisRound && !player.isAnswering ? "has-attempted" : ""}`}
          key={player.userId}
          layout
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        >
          <span className="place">{index + 1}</span>
          <Avatar player={player} />
          <div className="score-name">
            <strong>{player.displayName}</strong>
            <span>
              {player.isAnswering
                ? "отвечает"
                : player.hasAttemptedThisRound
                  ? "уже отвечал"
                  : state.winnerUserId === player.userId ? "победитель" : "в игре"}
            </span>
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
      <p>До четырёх участников появятся здесь автоматически. Остальные попадут в очередь.</p>
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

function ShoutDialog({ onClose }: { onClose: () => void }) {
  const [recording, setRecording] = useState(false);
  const [hasSavedShout, setHasSavedShout] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canRecord =
    "mediaDevices" in navigator &&
    "getUserMedia" in navigator.mediaDevices &&
    "MediaRecorder" in window;

  useEffect(() => {
    void loadShoutBlob()
      .then((blob) => setHasSavedShout(Boolean(blob)))
      .catch(() => setHasSavedShout(false));
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    if (!canRecord) {
      setMessage("Запись недоступна в этом браузере");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void saveShoutBlob(blob).then(() => {
          setHasSavedShout(true);
          setMessage("Выкрик сохранён на этом телефоне");
          stopStream();
        });
      };
      recorder.start();
      setRecording(true);
      setMessage("Записываем. Скажи коротко и громко.");
    } catch {
      setMessage("Не удалось получить доступ к микрофону");
      stopStream();
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const deleteRecording = async () => {
    await deleteShoutBlob();
    setHasSavedShout(false);
    setMessage("Выкрик удалён");
  };

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="name-dialog shout-dialog"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
      >
        <span className="eyebrow">Настройки игрока</span>
        <h2>Мой выкрик</h2>
        <p>Запись хранится только на этом телефоне. Если записи нет, сработает стандартный звук.</p>
        <div className="shout-status">
          <strong>{hasSavedShout ? "Запись готова" : "Записи пока нет"}</strong>
          <span>{recording ? "идёт запись" : "локальное хранилище"}</span>
        </div>
        {message ? <p className="inline-note">{message}</p> : null}
        <div className="shout-actions">
          {!recording ? (
            <button className="primary-button" onClick={() => void startRecording()} disabled={!canRecord}>
              Записать
            </button>
          ) : (
            <button className="primary-button" onClick={stopRecording}>
              Стоп
            </button>
          )}
          <button className="text-button" onClick={() => void playStoredShout()}>
            Прослушать
          </button>
          <button className="text-button" onClick={() => void deleteRecording()} disabled={!hasSavedShout || recording}>
            Удалить
          </button>
          <button className="text-button" onClick={onClose} disabled={recording}>
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NameDialog({
  initialValue,
  profile,
  required,
  onClose,
  onSubmit,
}: {
  initialValue: string;
  profile: ProfileState | null;
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
        <div className="name-preview" aria-hidden="true">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            <span>{initialValue.trim().slice(0, 2).toUpperCase() || "?"}</span>
          )}
          <div>
            <small>Здесь твои очки</small>
            <strong>0</strong>
          </div>
        </div>
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
