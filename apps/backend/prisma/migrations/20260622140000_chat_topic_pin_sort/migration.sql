-- AlterTable
ALTER TABLE "chat_topics" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "chat_topics" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Ordenação inicial por data de criação (dentro de cada chat)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "chatId" ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "chat_topics"
)
UPDATE "chat_topics"
SET "sortOrder" = ranked.rn
FROM ranked
WHERE "chat_topics".id = ranked.id;

-- CreateIndex
CREATE INDEX "chat_topics_chatId_isPinned_sortOrder_idx" ON "chat_topics"("chatId", "isPinned", "sortOrder");
