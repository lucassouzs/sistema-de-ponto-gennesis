-- Align scheduled_news timestamp columns with Prisma (camelCase, same as help_tutorials)

ALTER TABLE "scheduled_news" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "scheduled_news" RENAME COLUMN "updated_at" TO "updatedAt";

ALTER INDEX IF EXISTS "scheduled_news_created_at_idx" RENAME TO "scheduled_news_createdAt_idx";

ALTER TABLE "scheduled_news_views" RENAME COLUMN "created_at" TO "createdAt";
