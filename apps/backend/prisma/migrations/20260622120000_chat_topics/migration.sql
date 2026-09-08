-- CreateTable
CREATE TABLE "chat_topics" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "chat_topics_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "topicId" TEXT;

-- CreateIndex
CREATE INDEX "chat_topics_chatId_idx" ON "chat_topics"("chatId");
CREATE INDEX "chat_topics_chatId_lastMessageAt_idx" ON "chat_topics"("chatId", "lastMessageAt");
CREATE INDEX "chat_topics_createdById_idx" ON "chat_topics"("createdById");
CREATE INDEX "messages_topicId_idx" ON "messages"("topicId");
CREATE INDEX "messages_chatId_topicId_idx" ON "messages"("chatId", "topicId");

-- AddForeignKey
ALTER TABLE "chat_topics" ADD CONSTRAINT "chat_topics_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_topics" ADD CONSTRAINT "chat_topics_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "chat_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
