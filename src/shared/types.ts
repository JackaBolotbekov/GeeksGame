export type ViewerRole = "none" | "host" | "player" | "spectator";
export type ClaimableRole = "host" | "player";
export type MusicPlayback = "idle" | "playing" | "paused";

export interface SessionIdentity {
  sub: string;
  kind: "telegram" | "dev";
  telegramUserId?: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PlayerView {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  isBuzzed: boolean;
  isAnswering: boolean;
  hasAttemptedThisRound: boolean;
}

export interface ScoreEvent {
  id: number;
  userId: string;
  delta: 1 | -1;
}

export interface YouTubeTrack {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
}

export interface YouTubePlaylist {
  id: string;
  youtubePlaylistId: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  itemCount: number | null;
}

export interface AnswerAttempt {
  userId: string;
  attemptNumber: number;
  startedAt: number;
  deadlineAt: number;
  previousWrongUserIds: string[];
}

export interface GameState {
  players: PlayerView[];
  viewer: {
    role: ViewerRole;
    userId: string | null;
    queuePosition: number | null;
  };
  hostConnected: boolean;
  buzzerUserId: string | null;
  winnerUserId: string | null;
  round: number;
  scoreEvent: ScoreEvent | null;
  track: YouTubeTrack | null;
  musicPlayback: MusicPlayback;
  answerAttempt: AnswerAttempt | null;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export interface YouTubeSearchResult extends ActionResult {
  results?: YouTubeTrack[];
  nextPageToken?: string | null;
}

export interface YouTubePlaylistListResult extends ActionResult {
  playlists?: YouTubePlaylist[];
}

export interface YouTubePlaylistItemsResult extends ActionResult {
  results?: YouTubeTrack[];
  nextPageToken?: string | null;
}

export interface PlaylistAdminResult extends ActionResult {
  unlocked?: boolean;
}

export interface ClientToServerEvents {
  "role:claim": (role: ClaimableRole, callback: (result: ActionResult) => void) => void;
  "role:release": (callback: (result: ActionResult) => void) => void;
  "buzzer:press": (callback: (result: ActionResult) => void) => void;
  "host:score": (payload: { userId: string; delta: 1 | -1 }, callback: (result: ActionResult) => void) => void;
  "host:next-round": (callback: (result: ActionResult) => void) => void;
  "host:reset-match": (callback: (result: ActionResult) => void) => void;
  "host:remove-player": (userId: string, callback: (result: ActionResult) => void) => void;
  "host:youtube-search": (payload: { query: string; pageToken?: string | null }, callback: (result: YouTubeSearchResult) => void) => void;
  "host:playlist-admin-unlock": (payload: { pin: string }, callback: (result: PlaylistAdminResult) => void) => void;
  "host:playlists:list": (callback: (result: YouTubePlaylistListResult) => void) => void;
  "host:playlists:add": (payload: { url: string; title?: string | null }, callback: (result: YouTubePlaylistListResult) => void) => void;
  "host:playlists:delete": (id: string, callback: (result: YouTubePlaylistListResult) => void) => void;
  "host:playlist-items": (payload: { id: string; pageToken?: string | null }, callback: (result: YouTubePlaylistItemsResult) => void) => void;
  "host:track-select": (track: YouTubeTrack, callback: (result: ActionResult) => void) => void;
  "host:music-state": (playback: MusicPlayback, callback: (result: ActionResult) => void) => void;
}

export interface ServerToClientEvents {
  "game:state": (state: GameState) => void;
  "action:error": (message: string) => void;
}

export interface SocketData {
  identity: SessionIdentity | null;
}

export interface AuthResponse {
  sessionToken: string;
  profile: {
    displayName: string | null;
    avatarUrl: string | null;
    kind: "telegram" | "dev";
  };
  needsName: boolean;
}
