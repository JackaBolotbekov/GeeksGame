import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";
import type {
  AuthResponse,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionIdentity,
  SocketData,
} from "../shared/types";
import { GameRoom } from "./game-room";
import { createProfileStore } from "./profile-store";
import { createSessionToken, verifySessionToken } from "./session";
import { validateTelegramInitData } from "./telegram";

const port = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === "production";
const allowDevAuth = process.env.ALLOW_DEV_AUTH === "true" || !isProduction;
const sessionSecret = process.env.SESSION_SECRET ?? "geeksgame-local-development-secret";
const botToken = process.env.BOT_TOKEN;

if (isProduction && !process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is not configured; set it before enabling Telegram players.");
}
if (isProduction && !botToken) {
  console.warn("BOT_TOKEN is not configured; Telegram player login is disabled.");
}

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: process.env.CLIENT_ORIGIN
      ? { origin: process.env.CLIENT_ORIGIN, credentials: true }
      : undefined,
  },
);
const room = new GameRoom();
const profiles = createProfileStore();
const nameSchema = z.string().trim().min(2).max(24);

app.use(express.json({ limit: "32kb" }));

function bearerIdentity(authorization?: string): SessionIdentity | null {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return token ? verifySessionToken(token, sessionSecret) : null;
}

function authResponse(identity: SessionIdentity): AuthResponse {
  return {
    sessionToken: createSessionToken(identity, sessionSecret),
    profile: {
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      kind: identity.kind,
    },
    needsName: !identity.displayName,
  };
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/config", (_request, response) => {
  response.json({
    telegramConfigured: Boolean(botToken),
    devAuth: allowDevAuth,
  });
});

app.post("/api/auth/telegram", async (request, response) => {
  if (!botToken) {
    response.status(503).json({ message: "Telegram-вход пока не настроен" });
    return;
  }
  const parsed = z.object({ initData: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Telegram initData отсутствует" });
    return;
  }

  try {
    const telegramUser = validateTelegramInitData(parsed.data.initData, botToken);
    const profile = await profiles.findOrCreate(
      String(telegramUser.id),
      telegramUser.photo_url ?? null,
    );
    response.json(
      authResponse({
        sub: `telegram:${profile.telegramUserId}`,
        kind: "telegram",
        telegramUserId: profile.telegramUserId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }),
    );
  } catch (error) {
    console.error("Telegram authentication failed", error);
    response.status(401).json({ message: "Не удалось подтвердить вход через Telegram" });
  }
});

app.post("/api/auth/dev", (request, response) => {
  if (!allowDevAuth) {
    response.status(404).json({ message: "Not found" });
    return;
  }
  const parsed = z.object({ displayName: nameSchema }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Имя должно содержать от 2 до 24 символов" });
    return;
  }
  const suffix = crypto.randomUUID();
  response.json(
    authResponse({
      sub: `dev:${suffix}`,
      kind: "dev",
      displayName: parsed.data.displayName,
      avatarUrl: null,
    }),
  );
});

app.patch("/api/profile", async (request, response) => {
  const identity = bearerIdentity(request.header("authorization"));
  if (!identity?.telegramUserId) {
    response.status(401).json({ message: "Требуется Telegram-вход" });
    return;
  }
  const parsed = z.object({ displayName: nameSchema }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Имя должно содержать от 2 до 24 символов" });
    return;
  }

  try {
    const profile = await profiles.updateName(identity.telegramUserId, parsed.data.displayName);
    response.json(
      authResponse({
        ...identity,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }),
    );
  } catch (error) {
    console.error("Profile update failed", error);
    response.status(503).json({ message: "Не удалось сохранить имя" });
  }
});

io.use((socket, next) => {
  const token = typeof socket.handshake.auth.sessionToken === "string"
    ? socket.handshake.auth.sessionToken
    : null;
  socket.data.identity = token ? verifySessionToken(token, sessionSecret) : null;
  next();
});

function broadcastState(): void {
  io.sockets.sockets.forEach((socket) => {
    socket.emit("game:state", room.getState(socket.id));
  });
}

io.on("connection", (socket) => {
  socket.emit("game:state", room.getState(socket.id));

  socket.on("role:claim", (role, callback) => {
    if (role === "player" && socket.data.identity?.kind === "dev" && !allowDevAuth) {
      callback({ ok: false, message: "Игроки входят только через Telegram" });
      return;
    }
    const result = room.claim(socket.id, socket.data.identity, role);
    callback(result);
    broadcastState();
  });
  socket.on("role:release", (callback) => {
    const result = room.release(socket.id);
    callback(result);
    broadcastState();
  });
  socket.on("buzzer:press", (callback) => {
    const result = room.pressBuzzer(socket.id);
    callback(result);
    broadcastState();
  });
  socket.on("host:score", (payload, callback) => {
    const parsed = z.object({ userId: z.string(), delta: z.union([z.literal(1), z.literal(-1)]) })
      .safeParse(payload);
    const result = parsed.success
      ? room.score(socket.id, parsed.data.userId, parsed.data.delta)
      : { ok: false, message: "Некорректное изменение счёта" };
    callback(result);
    broadcastState();
  });
  socket.on("host:next-round", (callback) => {
    const result = room.nextRound(socket.id);
    callback(result);
    broadcastState();
  });
  socket.on("host:reset-match", (callback) => {
    const result = room.resetMatch(socket.id);
    callback(result);
    broadcastState();
  });
  socket.on("host:remove-player", (userId, callback) => {
    const result = room.removePlayer(socket.id, userId);
    callback(result);
    broadcastState();
  });
  socket.on("disconnect", () => {
    room.disconnect(socket.id);
    broadcastState();
  });
});

const clientRoot = resolve(process.cwd(), "dist/client");
app.use(express.static(clientRoot));
app.use((request, response, next) => {
  if (request.method === "GET" && !request.path.startsWith("/api/")) {
    response.sendFile(resolve(clientRoot, "index.html"));
    return;
  }
  next();
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`GeeksGame listening on http://0.0.0.0:${port}`);
});
