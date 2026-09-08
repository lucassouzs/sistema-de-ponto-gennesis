-- CreateEnum
CREATE TYPE "ScheduledNewsStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduledNewsAudienceType" AS ENUM ('ALL', 'DEPARTMENTS', 'POSITIONS', 'USERS');

-- CreateTable
CREATE TABLE "scheduled_news" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "image_url" TEXT,
    "image_key" TEXT,
    "status" "ScheduledNewsStatus" NOT NULL DEFAULT 'DRAFT',
    "audience_type" "ScheduledNewsAudienceType" NOT NULL DEFAULT 'ALL',
    "audience_departments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience_positions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "publish_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_news_views" (
    "id" TEXT NOT NULL,
    "news_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_news_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_news_status_publish_at_idx" ON "scheduled_news"("status", "publish_at");

-- CreateIndex
CREATE INDEX "scheduled_news_audience_type_idx" ON "scheduled_news"("audience_type");

-- CreateIndex
CREATE INDEX "scheduled_news_created_at_idx" ON "scheduled_news"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_news_views_news_id_user_id_key" ON "scheduled_news_views"("news_id", "user_id");

-- CreateIndex
CREATE INDEX "scheduled_news_views_user_id_seen_at_idx" ON "scheduled_news_views"("user_id", "seen_at");

-- AddForeignKey
ALTER TABLE "scheduled_news" ADD CONSTRAINT "scheduled_news_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_news" ADD CONSTRAINT "scheduled_news_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_news_views" ADD CONSTRAINT "scheduled_news_views_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "scheduled_news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_news_views" ADD CONSTRAINT "scheduled_news_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
