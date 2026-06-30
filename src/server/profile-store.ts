import { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "./prisma";

export interface StoredProfile {
  telegramUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ProfileStore {
  findOrCreate(telegramUserId: string, avatarUrl: string | null): Promise<StoredProfile>;
  updateName(telegramUserId: string, displayName: string): Promise<StoredProfile>;
}

export class MemoryProfileStore implements ProfileStore {
  private readonly profiles = new Map<string, StoredProfile>();

  async findOrCreate(telegramUserId: string, avatarUrl: string | null): Promise<StoredProfile> {
    const existing = this.profiles.get(telegramUserId);
    const profile = existing
      ? { ...existing, avatarUrl }
      : { telegramUserId, displayName: null, avatarUrl };
    this.profiles.set(telegramUserId, profile);
    return profile;
  }

  async updateName(telegramUserId: string, displayName: string): Promise<StoredProfile> {
    const existing = this.profiles.get(telegramUserId) ?? {
      telegramUserId,
      displayName: null,
      avatarUrl: null,
    };
    const profile = { ...existing, displayName };
    this.profiles.set(telegramUserId, profile);
    return profile;
  }
}

export class PrismaProfileStore implements ProfileStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreate(telegramUserId: string, avatarUrl: string | null): Promise<StoredProfile> {
    const profile = await this.prisma.playerProfile.upsert({
      where: { telegramUserId: BigInt(telegramUserId) },
      create: { telegramUserId: BigInt(telegramUserId), avatarUrl },
      update: { avatarUrl, lastSeenAt: new Date() },
    });
    return {
      telegramUserId: profile.telegramUserId.toString(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
  }

  async updateName(telegramUserId: string, displayName: string): Promise<StoredProfile> {
    const profile = await this.prisma.playerProfile.update({
      where: { telegramUserId: BigInt(telegramUserId) },
      data: { displayName, lastSeenAt: new Date() },
    });
    return {
      telegramUserId: profile.telegramUserId.toString(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
  }
}

export function createProfileStore(): ProfileStore {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not configured; player profiles use temporary memory storage.");
    return new MemoryProfileStore();
  }
  return new PrismaProfileStore(getPrismaClient());
}
