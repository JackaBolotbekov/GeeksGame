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

export interface YouTubePlaylistMetadata {
  youtubePlaylistId: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  itemCount: number | null;
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

interface YouTubePlaylistItem {
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
    resourceId?: {
      videoId?: string;
    };
  };
}

interface YouTubePlaylistResource {
  id?: string;
  snippet?: {
    title?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
  };
  contentDetails?: {
    itemCount?: number;
  };
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const YOUTUBE_PAGE_SIZE = 12;
const YOUTUBE_PLAYLIST_PAGE_SIZE = 24;

function bestThumbnail(thumbnails?: {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
  standard?: { url?: string };
  maxres?: { url?: string };
}): string | null {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

export function parseYouTubePlaylistId(input: string): string {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{10,120}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const list = url.searchParams.get("list");
    if (list && /^[a-zA-Z0-9_-]{10,120}$/.test(list)) return list;
  } catch {
    throw new Error("Не удалось найти playlistId в ссылке YouTube");
  }

  throw new Error("Не удалось найти playlistId в ссылке YouTube");
}

export class YouTubeSearchService {
  private readonly searchCache = new Map<string, CachedResults>();
  private readonly playlistItemsCache = new Map<string, CachedResults>();
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
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.response;

    const response = this.options.mock
      ? this.mockResults(normalizedQuery, normalizedPageToken)
      : await this.fetchResults(normalizedQuery, normalizedPageToken);

    this.searchCache.set(cacheKey, {
      response,
      expiresAt: this.now() + CACHE_TTL_MS,
    });
    return response;
  }

  async resolvePlaylist(input: string): Promise<YouTubePlaylistMetadata> {
    const youtubePlaylistId = parseYouTubePlaylistId(input);
    const sourceUrl = `https://www.youtube.com/playlist?list=${youtubePlaylistId}`;
    const response = this.options.mock
      ? this.mockPlaylist(youtubePlaylistId, sourceUrl)
      : await this.fetchPlaylist(youtubePlaylistId, sourceUrl);
    return response;
  }

  async playlistItems(playlistId: string, pageToken?: string | null): Promise<YouTubeSearchResponse> {
    const normalizedPageToken = pageToken?.trim() || null;
    const cacheKey = `${playlistId}::${normalizedPageToken ?? "first"}`;
    const cached = this.playlistItemsCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.response;

    const response = this.options.mock
      ? this.mockPlaylistItems(playlistId, normalizedPageToken)
      : await this.fetchPlaylistItems(playlistId, normalizedPageToken);

    this.playlistItemsCache.set(cacheKey, {
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
          thumbnailUrl: bestThumbnail(snippet.thumbnails),
        };
      })
      .filter((item): item is YouTubeTrack => Boolean(item));
    return {
      results,
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  private async fetchPlaylist(playlistId: string, sourceUrl: string): Promise<YouTubePlaylistMetadata> {
    if (!this.options.apiKey) {
      throw new Error("YOUTUBE_API_KEY не настроен");
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
    url.search = new URLSearchParams({
      key: this.options.apiKey,
      part: "snippet,contentDetails",
      id: playlistId,
      maxResults: "1",
    }).toString();

    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`YouTube API вернул ${response.status}`);

    const data = await response.json() as { items?: YouTubePlaylistResource[] };
    const playlist = data.items?.[0];
    if (!playlist?.id || !playlist.snippet?.title) {
      throw new Error("Плейлист не найден или недоступен. Проверьте, что он public или unlisted.");
    }

    return {
      youtubePlaylistId: playlist.id,
      title: playlist.snippet.title,
      sourceUrl,
      thumbnailUrl: bestThumbnail(playlist.snippet.thumbnails),
      itemCount: playlist.contentDetails?.itemCount ?? null,
    };
  }

  private async fetchPlaylistItems(playlistId: string, pageToken: string | null): Promise<YouTubeSearchResponse> {
    if (!this.options.apiKey) {
      throw new Error("YOUTUBE_API_KEY не настроен");
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    const params = new URLSearchParams({
      key: this.options.apiKey,
      part: "snippet",
      playlistId,
      maxResults: String(YOUTUBE_PLAYLIST_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    url.search = params.toString();

    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`YouTube API вернул ${response.status}`);

    const data = await response.json() as { items?: YouTubePlaylistItem[]; nextPageToken?: string };
    const results = (data.items ?? [])
      .map((item) => {
        const snippet = item.snippet;
        const title = snippet?.title;
        const videoId = snippet?.resourceId?.videoId;
        if (!title || !videoId || ["Deleted video", "Private video"].includes(title)) return null;
        return {
          videoId,
          title,
          channelTitle: snippet.channelTitle ?? "YouTube",
          thumbnailUrl: bestThumbnail(snippet.thumbnails),
        };
      })
      .filter((item): item is YouTubeTrack => Boolean(item));

    if (!results.length && !data.nextPageToken) {
      throw new Error("В плейлисте нет доступных видео");
    }

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

  private mockPlaylist(playlistId: string, sourceUrl: string): YouTubePlaylistMetadata {
    return {
      youtubePlaylistId: playlistId,
      title: `Mock playlist ${playlistId.slice(0, 6)}`,
      sourceUrl,
      thumbnailUrl: null,
      itemCount: 48,
    };
  }

  private mockPlaylistItems(playlistId: string, pageToken: string | null): YouTubeSearchResponse {
    const page = pageToken === "mock-playlist-page-2" ? 2 : 1;
    const results = Array.from({ length: YOUTUBE_PLAYLIST_PAGE_SIZE }, (_, index) => {
      const itemNumber = (page - 1) * YOUTUBE_PLAYLIST_PAGE_SIZE + index + 1;
      return {
        videoId: itemNumber === 1 ? "M7lc1UVf-VE" : `mock-playlist-video-${itemNumber}`,
        title: `${playlistId} · плейлист трек ${itemNumber}`,
        channelTitle: "GeeksGame Playlist",
        thumbnailUrl: null,
      };
    });
    return {
      results,
      nextPageToken: page === 1 ? "mock-playlist-page-2" : null,
    };
  }
}
