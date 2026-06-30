import { describe, expect, it, vi } from "vitest";
import { parseYouTubePlaylistId, YouTubeSearchService } from "../src/server/youtube-search";

const youtubeResponse = {
  nextPageToken: "next-token",
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

const playlistResponse = {
  items: [
    {
      id: "PLgeeks123456",
      snippet: {
        title: "Geeks playlist",
        thumbnails: { high: { url: "https://img.youtube.com/playlist.jpg" } },
      },
      contentDetails: { itemCount: 42 },
    },
  ],
};

const playlistItemsResponse = {
  nextPageToken: "playlist-next",
  items: [
    {
      snippet: {
        title: "Playlist track",
        channelTitle: "Geeks",
        resourceId: { videoId: "playlist-video" },
        thumbnails: { medium: { url: "https://img.youtube.com/playlist-video.jpg" } },
      },
    },
    {
      snippet: {
        title: "Private video",
        channelTitle: "Hidden",
        resourceId: { videoId: "private-video" },
        thumbnails: {},
      },
    },
  ],
};

describe("YouTubeSearchService", () => {
  it("parses playlist ids from common YouTube URLs and raw ids", () => {
    expect(parseYouTubePlaylistId("PL1234567890abcdef")).toBe("PL1234567890abcdef");
    expect(parseYouTubePlaylistId("https://www.youtube.com/playlist?list=PL1234567890abcdef")).toBe("PL1234567890abcdef");
    expect(parseYouTubePlaylistId("https://www.youtube.com/watch?v=abc&list=PL1234567890abcdef")).toBe("PL1234567890abcdef");
    expect(parseYouTubePlaylistId("https://music.youtube.com/playlist?list=PL1234567890abcdef")).toBe("PL1234567890abcdef");
    expect(() => parseYouTubePlaylistId("https://www.youtube.com/watch?v=abc")).toThrow("playlistId");
  });

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
    expect(first).toEqual({
      nextPageToken: "next-token",
      results: [
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
      ],
    });

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("type")).toBe("video");
    expect(requestedUrl.searchParams.get("videoEmbeddable")).toBe("true");
    expect(requestedUrl.searchParams.get("videoSyndicated")).toBe("true");
    expect(requestedUrl.searchParams.get("maxResults")).toBe("12");

    now += 10 * 60 * 1000 + 1;
    await service.search("чоко");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses page tokens and caches pages separately", async () => {
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
    });

    await service.search("чоко");
    await service.search("чоко", "second-page");
    await service.search("чоко", "second-page");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const requestedUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(requestedUrl.searchParams.get("pageToken")).toBe("second-page");
  });

  it("fails clearly when an API key is missing", async () => {
    const service = new YouTubeSearchService({});
    await expect(service.search("чоко")).rejects.toThrow("YOUTUBE_API_KEY не настроен");
  });

  it("loads playlist metadata from a public playlist URL", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => {
      void _input;
      return {
        ok: true,
        status: 200,
        json: async () => playlistResponse,
      } as Response;
    });
    const service = new YouTubeSearchService({
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const playlist = await service.resolvePlaylist("https://www.youtube.com/playlist?list=PLgeeks123456");

    expect(playlist).toEqual({
      youtubePlaylistId: "PLgeeks123456",
      title: "Geeks playlist",
      sourceUrl: "https://www.youtube.com/playlist?list=PLgeeks123456",
      thumbnailUrl: "https://img.youtube.com/playlist.jpg",
      itemCount: 42,
    });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe("/youtube/v3/playlists");
    expect(requestedUrl.searchParams.get("id")).toBe("PLgeeks123456");
    expect(requestedUrl.searchParams.get("part")).toBe("snippet,contentDetails");
  });

  it("loads playlist items, skips private videos, and caches pages", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => {
      void _input;
      return {
        ok: true,
        status: 200,
        json: async () => playlistItemsResponse,
      } as Response;
    });
    const service = new YouTubeSearchService({
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const first = await service.playlistItems("PLgeeks123456");
    const cached = await service.playlistItems("PLgeeks123456");
    const secondPage = await service.playlistItems("PLgeeks123456", "playlist-next");

    expect(first).toEqual(cached);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(first).toEqual({
      nextPageToken: "playlist-next",
      results: [
        {
          videoId: "playlist-video",
          title: "Playlist track",
          channelTitle: "Geeks",
          thumbnailUrl: "https://img.youtube.com/playlist-video.jpg",
        },
      ],
    });
    expect(secondPage.results).toHaveLength(1);
    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    const secondUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(firstUrl.pathname).toBe("/youtube/v3/playlistItems");
    expect(firstUrl.searchParams.get("playlistId")).toBe("PLgeeks123456");
    expect(firstUrl.searchParams.get("maxResults")).toBe("24");
    expect(secondUrl.searchParams.get("pageToken")).toBe("playlist-next");
  });

  it("can return deterministic mock results for e2e", async () => {
    const service = new YouTubeSearchService({ mock: true });
    const first = await service.search("тест");
    const second = await service.search("тест", first.nextPageToken);
    const playlist = await service.resolvePlaylist("https://www.youtube.com/playlist?list=PLmockplaylist");
    const playlistFirst = await service.playlistItems(playlist.youtubePlaylistId);
    const playlistSecond = await service.playlistItems(playlist.youtubePlaylistId, playlistFirst.nextPageToken);
    expect(first.results).toHaveLength(12);
    expect(first.nextPageToken).toBe("mock-page-2");
    expect(second.results).toHaveLength(12);
    expect(second.nextPageToken).toBeNull();
    expect(first.results[0].title).toContain("тест");
    expect(playlist.title).toContain("Mock playlist");
    expect(playlistFirst.results).toHaveLength(24);
    expect(playlistFirst.nextPageToken).toBe("mock-playlist-page-2");
    expect(playlistSecond.results).toHaveLength(24);
  });
});
