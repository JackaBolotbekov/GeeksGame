import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ActionResult,
  ClaimableRole,
  ClientToServerEvents,
  GameState,
  MusicPlayback,
  ServerToClientEvents,
  YouTubeSearchResult,
  YouTubeTrack,
} from "../shared/types";

const initialState: GameState = {
  players: [],
  viewer: { role: "none", userId: null, queuePosition: null },
  hostConnected: false,
  buzzerUserId: null,
  winnerUserId: null,
  round: 1,
  scoreEvent: null,
  track: null,
  musicPlayback: "idle",
  answerAttempt: null,
};

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useGameSocket(sessionToken: string | null) {
  const [state, setState] = useState<GameState>(initialState);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    const socket: GameSocket = io({ auth: { sessionToken } });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setMessage("Не удалось подключиться к игре"));
    socket.on("game:state", setState);
    socket.on("action:error", setMessage);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionToken]);

  const withAck = useCallback(
    <T extends ActionResult>(emit: (socket: GameSocket, callback: (result: T) => void) => void) =>
      new Promise<T>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, message: "Нет соединения с игрой" } as T);
          return;
        }
        emit(socket, (result) => {
          if (!result.ok && result.message) setMessage(result.message);
          resolve(result);
        });
      }),
    [],
  );

  const claim = useCallback(
    (role: ClaimableRole) =>
      withAck((socket, callback) => socket.emit("role:claim", role, callback)),
    [withAck],
  );
  const release = useCallback(
    () => withAck((socket, callback) => socket.emit("role:release", callback)),
    [withAck],
  );
  const buzz = useCallback(
    () => withAck((socket, callback) => socket.emit("buzzer:press", callback)),
    [withAck],
  );
  const score = useCallback(
    (userId: string, delta: 1 | -1) =>
      withAck((socket, callback) => socket.emit("host:score", { userId, delta }, callback)),
    [withAck],
  );
  const nextRound = useCallback(
    () => withAck((socket, callback) => socket.emit("host:next-round", callback)),
    [withAck],
  );
  const resetMatch = useCallback(
    () => withAck((socket, callback) => socket.emit("host:reset-match", callback)),
    [withAck],
  );
  const removePlayer = useCallback(
    (userId: string) =>
      withAck((socket, callback) => socket.emit("host:remove-player", userId, callback)),
    [withAck],
  );
  const youtubeSearch = useCallback(
    (query: string, pageToken?: string | null) =>
      withAck<YouTubeSearchResult>((socket, callback) =>
        socket.emit("host:youtube-search", { query, pageToken }, callback)),
    [withAck],
  );
  const selectTrack = useCallback(
    (track: YouTubeTrack) =>
      withAck((socket, callback) => socket.emit("host:track-select", track, callback)),
    [withAck],
  );
  const setMusicState = useCallback(
    (playback: MusicPlayback) =>
      withAck((socket, callback) => socket.emit("host:music-state", playback, callback)),
    [withAck],
  );

  return {
    state,
    connected,
    message,
    clearMessage: () => setMessage(null),
    claim,
    release,
    buzz,
    score,
    nextRound,
    resetMatch,
    removePlayer,
    youtubeSearch,
    selectTrack,
    setMusicState,
  };
}
