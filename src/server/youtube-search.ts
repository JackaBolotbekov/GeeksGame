import type { YouTubeTrack } from "../shared/types";

interface YouTubeSearchOptions {
  apiKey?: string;
  mock?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface CachedResults {
  expiresAt: number;
  response: YouTubeSearchResponse;
}

export interface YouTubeSearchResponse {
  results: YouTubeTrack[];
  nextPageToken: string | null;
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
const YOUTUBE_PAGE_SIZE = 12;

export class YouTubeSearchService {
  private readonly cache = new Map<string, CachedResults>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: YouTubeSearchOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async search(query: string, pageToken?: string | null): Promise<YouTubeSearchResponse> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");
    const normalizedPageToken = pageToken?.trim() || null;
    const cacheKey = `${normalizedQuery.toLowerCase()}::${normalizedPageToken ?? "first"}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.response;

    const response = this.options.mock
      ? this.mockResults(normalizedQuery, normalizedPageToken)
      : await this.fetchResults(normalizedQuery, normalizedPageToken);

    this.cache.set(cacheKey, {
      response,
      expiresAt: this.now() + CACHE_TTL_MS,
    });
    return response;
  }

  private async fetchResults(query: string, pageToken: string | null): Promise<YouTubeSearchResponse> {
    if (!this.options.apiKey) {
      throw new Error("YOUTUBE_API_KEY не настроен");
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    const params = new URLSearchParams({
      key: this.options.apiKey,
      part: "snippet",
      q: query,
      maxResults: String(YOUTUBE_PAGE_SIZE),
      type: "video",
      videoEmbeddable: "true",
      videoSyndicated: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    url.search = params.toString();

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`YouTube API вернул ${response.status}`);
    }

    const data = await response.json() as { items?: YouTubeSearchItem[]; nextPageToken?: string };
    const results = (data.items ?? [])
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
    return {
      results,
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  private mockResults(query: string, pageToken: string | null): YouTubeSearchResponse {
    const page = pageToken === "mock-page-2" ? 2 : 1;
    const results = Array.from({ length: YOUTUBE_PAGE_SIZE }, (_, index) => {
      const itemNumber = (page - 1) * YOUTUBE_PAGE_SIZE + index + 1;
      return {
        videoId: itemNumber === 1 ? "dQw4w9WgXcQ" : `mock-video-${itemNumber}`,
        title: `${query} · тестовый трек ${itemNumber}`,
        channelTitle: "GeeksGame Mock",
        thumbnailUrl: null,
      };
    });
    return {
      results,
      nextPageToken: page === 1 ? "mock-page-2" : null,
    };
  }
}
