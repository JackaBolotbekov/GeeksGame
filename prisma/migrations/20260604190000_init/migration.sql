CREATE TABLE "player_profiles" (
    "id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "display_name" VARCHAR(24),
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_profiles_telegram_user_id_key"
ON "player_profiles"("telegram_user_id");
