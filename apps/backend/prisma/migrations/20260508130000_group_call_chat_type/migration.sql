-- AlterEnum
ALTER TYPE "ChatType" ADD VALUE 'GROUP_CALL';

-- AlterTable
ALTER TABLE "chats" ADD COLUMN "parentGroupChatId" TEXT,
ADD COLUMN "groupCallSessionId" TEXT;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_parentGroupChatId_fkey" FOREIGN KEY ("parentGroupChatId") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "chats_parentGroupChatId_idx" ON "chats"("parentGroupChatId");
CREATE INDEX "chats_groupCallSessionId_idx" ON "chats"("groupCallSessionId");
