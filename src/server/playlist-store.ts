import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { YouTubePlaylist } from "../shared/types";
import { getPrismaClient } from "./prisma";

export interface UpsertPlaylistInput {
  youtubePlaylistId: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  itemCount: number | null;
}

export interface PlaylistStore {
  list(): Promise<YouTubePlaylist[]>;
  get(id: string): Promise<YouTubePlaylist | null>;
  upsert(input: UpsertPlaylistInput): Promise<YouTubePlaylist>;
  delete(id: string): Promise<void>;
}

function normalizePlaylist(playlist: {
  id: string;
  youtubePlaylistId: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  itemCount: number | null;
}): YouTubePlaylist {
  return {
    id: playlist.id,
    youtubePlaylistId: playlist.youtubePlaylistId,
    title: playlist.title,
    sourceUrl: playlist.sourceUrl,
    thumbnailUrl: playlist.thumbnailUrl,
    itemCount: playlist.itemCount,
  };
}

export class MemoryPlaylistStore implements PlaylistStore {
  private readonly playlists = new Map<string, YouTubePlaylist>();

  async list(): Promise<YouTubePlaylist[]> {
    return [...this.playlists.values()].sort((left, right) => left.title.localeCompare(right.title));
  }

  async get(id: string): Promise<YouTubePlaylist | null> {
    return this.playlists.get(id) ?? null;
  }

  async upsert(input: UpsertPlaylistInput): Promise<YouTubePlaylist> {
    const existing = [...this.playlists.values()].find(
      (playlist) => playlist.youtubePlaylistId === input.youtubePlaylistId,
    );
    const playlist: YouTubePlaylist = {
      id: existing?.id ?? randomUUID(),
      ...input,
    };
    this.playlists.set(playlist.id, playlist);
    return playlist;
  }

  async delete(id: string): Promise<void> {
    this.playlists.delete(id);
  }
}

export class PrismaPlaylistStore implements PlaylistStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<YouTubePlaylist[]> {
    const playlists = await this.prisma.youTubePlaylist.findMany({
      orderBy: { title: "asc" },
    });
    return playlists.map(normalizePlaylist);
  }

  async get(id: string): Promise<YouTubePlaylist | null> {
    const playlist = await this.prisma.youTubePlaylist.findUnique({ where: { id } });
    return playlist ? normalizePlaylist(playlist) : null;
  }

  async upsert(input: UpsertPlaylistInput): Promise<YouTubePlaylist> {
    const playlist = await this.prisma.youTubePlaylist.upsert({
      where: { youtubePlaylistId: input.youtubePlaylistId },
      create: { ...input, lastSyncedAt: new Date() },
      update: { ...input, lastSyncedAt: new Date() },
    });
    return normalizePlaylist(playlist);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.youTubePlaylist.delete({ where: { id } });
  }
}

export function createPlaylistStore(): PlaylistStore {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not configured; YouTube playlists use temporary memory storage.");
    return new MemoryPlaylistStore();
  }
  return new PrismaPlaylistStore(getPrismaClient());
}
