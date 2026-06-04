import { describe, expect, it } from "vitest";
import type { SessionIdentity } from "../src/shared/types";
import { GameRoom } from "../src/server/game-room";

const player = (id: string, name: string): SessionIdentity => ({
  sub: id,
  kind: "dev",
  displayName: name,
  avatarUrl: null,
});

function setup() {
  const room = new GameRoom();
  room.claim("host", null, "host");
  room.claim("one-socket", player("one", "Чоко"), "player");
  room.claim("two-socket", player("two", "Медер"), "player");
  return room;
}

describe("GameRoom", () => {
  it("locks the buzzer to the first player", () => {
    const room = setup();
    expect(room.pressBuzzer("two-socket").ok).toBe(true);
    expect(room.pressBuzzer("one-socket").ok).toBe(false);
    expect(room.getState("host").buzzerUserId).toBe("two");
  });

  it("scores, starts a new round, and never goes below zero", () => {
    const room = setup();
    room.pressBuzzer("one-socket");
    room.score("host", "one", -1);
    let state = room.getState("host");
    expect(state.players.find((item) => item.userId === "one")?.score).toBe(0);
    expect(state.buzzerUserId).toBeNull();
    expect(state.round).toBe(2);

    room.score("host", "one", 1);
    state = room.getState("host");
    expect(state.players[0].userId).toBe("one");
    expect(state.players[0].score).toBe(1);
  });

  it("keeps current order on a tied score", () => {
    const room = setup();
    room.score("host", "two", 1);
    room.score("host", "one", 1);
    expect(room.getState("host").players.map((item) => item.userId)).toEqual(["two", "one"]);
  });

  it("promotes the first queued spectator when a player disconnects", () => {
    const room = setup();
    room.claim("three-socket", player("three", "Алия"), "player");
    room.claim("four-socket", player("four", "Эрмек"), "player");
    expect(room.getState("three-socket").viewer.queuePosition).toBe(1);

    room.disconnect("one-socket");
    const promoted = room.getState("three-socket");
    expect(promoted.viewer.role).toBe("player");
    expect(promoted.players.some((item) => item.userId === "three")).toBe(true);
    expect(room.getState("four-socket").viewer.queuePosition).toBe(1);
  });

  it("ends at ten points and blocks further score changes until reset", () => {
    const room = setup();
    for (let point = 0; point < 10; point += 1) room.score("host", "one", 1);
    expect(room.getState("host").winnerUserId).toBe("one");
    expect(room.score("host", "two", 1).ok).toBe(false);
    expect(room.resetMatch("host").ok).toBe(true);
    expect(room.getState("host").winnerUserId).toBeNull();
  });

  it("rejects host actions from players", () => {
    const room = setup();
    expect(room.score("one-socket", "one", 1).ok).toBe(false);
    expect(room.removePlayer("one-socket", "two").ok).toBe(false);
  });

  it("does not let one identity occupy multiple player slots", () => {
    const room = new GameRoom();
    expect(room.claim("one-socket", player("one", "Чоко"), "player").ok).toBe(true);
    expect(room.claim("duplicate-socket", player("one", "Чоко"), "player").ok).toBe(false);
    expect(room.getState("one-socket").players).toHaveLength(1);
  });

  it("keeps a player's place when the occupied host role claim fails", () => {
    const room = setup();
    expect(room.claim("one-socket", player("one", "Чоко"), "host").ok).toBe(false);
    expect(room.getState("one-socket").viewer.role).toBe("player");
  });
});
