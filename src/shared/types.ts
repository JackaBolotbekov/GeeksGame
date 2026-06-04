export type ViewerRole = "none" | "host" | "player" | "spectator";
export type ClaimableRole = "host" | "player";

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
}

export interface ScoreEvent {
  id: number;
  userId: string;
  delta: 1 | -1;
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
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export interface ClientToServerEvents {
  "role:claim": (role: ClaimableRole, callback: (result: ActionResult) => void) => void;
  "role:release": (callback: (result: ActionResult) => void) => void;
  "buzzer:press": (callback: (result: ActionResult) => void) => void;
  "host:score": (payload: { userId: string; delta: 1 | -1 }, callback: (result: ActionResult) => void) => void;
  "host:next-round": (callback: (result: ActionResult) => void) => void;
  "host:reset-match": (callback: (result: ActionResult) => void) => void;
  "host:remove-player": (userId: string, callback: (result: ActionResult) => void) => void;
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
