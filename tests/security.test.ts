import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "../src/server/session";
import { validateTelegramInitData } from "../src/server/telegram";

describe("session tokens", () => {
  it("round-trips a signed identity and rejects tampering", () => {
    const token = createSessionToken(
      { sub: "telegram:1", kind: "telegram", telegramUserId: "1", displayName: "Чоко", avatarUrl: null },
      "secret",
      60,
    );
    expect(verifySessionToken(token, "secret")?.displayName).toBe("Чоко");
    expect(verifySessionToken(`${token}x`, "secret")).toBeNull();
  });
});

describe("Telegram initData", () => {
  it("validates Telegram HMAC and returns the user", () => {
    const token = "test-bot-token";
    const authDate = 1_700_000_000;
    const params = new URLSearchParams({
      auth_date: String(authDate),
      query_id: "query",
      user: JSON.stringify({ id: 42, first_name: "Чоко", photo_url: "https://example.com/a.jpg" }),
    });
    const check = [...params.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));

    expect(validateTelegramInitData(params.toString(), token, 100, authDate).id).toBe(42);
  });

  it("rejects expired data", () => {
    expect(() => validateTelegramInitData("auth_date=1&hash=00", "token", 10, 100)).toThrow(
      "expired",
    );
  });
});
