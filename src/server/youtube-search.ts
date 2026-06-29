import type { YouTubeTrack } from "../shared/types";

interface YouTubeSearchOptions {
  apiKey?: string;
  mock?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface CachedResults {
  expiresAt: number;
  results: YouTubeTrack[];
}

interface YouTubeSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
}

const CACHE_TTL_MS = 10 * 60 * 1000;

export class YouTubeSearchService {
  private readonly cache = new Map<string, CachedResults>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: YouTubeSearchOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async search(query: string): Promise<YouTubeTrack[]> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");
    const cacheKey = normalizedQuery.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.results;

    const results = this.options.mock
      ? this.mockResults(normalizedQuery)
      : await this.fetchResults(normalizedQuery);

    this.cache.set(cacheKey, {
      results,
      expiresAt: this.now() + CACHE_TTL_MS,
    });
    return results;
  }

  private async fetchResults(query: string): Promise<YouTubeTrack[]> {
    if (!this.options.apiKey) {
      throw new Error("YOUTUBE_API_KEY не настроен");
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({
      key: this.options.apiKey,
      part: "snippet",
      q: query,
      maxResults: "8",
      type: "video",
      videoEmbeddable: "true",
      videoSyndicated: "true",
    }).toString();

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`YouTube API вернул ${response.status}`);
    }

    const data = await response.json() as { items?: YouTubeSearchItem[] };
    return (data.items ?? [])
      .map((item) => {
        const videoId = item.id?.videoId;
        const snippet = item.snippet;
        if (!videoId || !snippet?.title) return null;
        return {
          videoId,
          title: snippet.title,
          channelTitle: snippet.channelTitle ?? "YouTube",
          thumbnailUrl:
            snippet.thumbnails?.medium?.url ??
            snippet.thumbnails?.high?.url ??
            snippet.thumbnails?.default?.url ??
            null,
        };
      })
      .filter((item): item is YouTubeTrack => Boolean(item));
  }

  private mockResults(query: string): YouTubeTrack[] {
    return [
      {
        videoId: "dQw4w9WgXcQ",
        title: `${query} · тестовый трек`,
        channelTitle: "GeeksGame Mock",
        thumbnailUrl: null,
      },
      {
        videoId: "M7lc1UVf-VE",
        title: `${query} · второй вариант`,
        channelTitle: "GeeksGame Mock",
        thumbnailUrl: null,
      },
    ];
  }
}
