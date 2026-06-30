CREATE TABLE "youtube_playlists" (
    "id" TEXT NOT NULL,
    "youtube_playlist_id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "source_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "item_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "youtube_playlists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "youtube_playlists_youtube_playlist_id_key"
ON "youtube_playlists"("youtube_playlist_id");
