import { describe, expect, it, vi } from "vitest";
import { YouTubeSearchService } from "../src/server/youtube-search";

const youtubeResponse = {
  items: [
    {
      id: { videoId: "video-one" },
      snippet: {
        title: "Первый трек",
        channelTitle: "Geeks",
        thumbnails: { medium: { url: "https://img.youtube.com/one.jpg" } },
      },
    },
    {
      id: { videoId: "video-two" },
      snippet: {
        title: "Второй трек",
        channelTitle: "Game",
        thumbnails: {},
      },
    },
  ],
};

describe("YouTubeSearchService", () => {
  it("maps YouTube search results and caches them for ten minutes", async () => {
    let now = 1_000;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => {
      void _input;
      return {
        ok: true,
        status: 200,
        json: async () => youtubeResponse,
      } as Response;
    });
    const service = new YouTubeSearchService({
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });

    const first = await service.search("  чоко  ");
    const second = await service.search("ЧОКО");
    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toEqual([
      {
        videoId: "video-one",
        title: "Первый трек",
        channelTitle: "Geeks",
        thumbnailUrl: "https://img.youtube.com/one.jpg",
      },
      {
        videoId: "video-two",
        title: "Второй трек",
        channelTitle: "Game",
        thumbnailUrl: null,
      },
    ]);

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("type")).toBe("video");
    expect(requestedUrl.searchParams.get("videoEmbeddable")).toBe("true");
    expect(requestedUrl.searchParams.get("videoSyndicated")).toBe("true");
    expect(requestedUrl.searchParams.get("maxResults")).toBe("8");

    now += 10 * 60 * 1000 + 1;
    await service.search("чоко");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when an API key is missing", async () => {
    const service = new YouTubeSearchService({});
    await expect(service.search("чоко")).rejects.toThrow("YOUTUBE_API_KEY не настроен");
  });

  it("can return deterministic mock results for e2e", async () => {
    const service = new YouTubeSearchService({ mock: true });
    const results = await service.search("тест");
    expect(results).toHaveLength(2);
    expect(results[0].title).toContain("тест");
  });
});
