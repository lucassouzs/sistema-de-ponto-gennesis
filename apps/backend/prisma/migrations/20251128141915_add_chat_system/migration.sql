/*
  Warnings:

  - You are about to drop the column `isImportant` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `parentMessageId` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `recipientDepartment` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `messages` table. All the data in the column will be lost.
  - Added the required column `chatId` to the `messages` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CLOSED');

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_parentMessageId_fkey";

-- DropIndex
DROP INDEX "messages_recipientDepartment_idx";

-- DropIndex
DROP INDEX "messages_status_idx";

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "isImportant",
DROP COLUMN "parentMessageId",
DROP COLUMN "recipientDepartment",
DROP COLUMN "status",
DROP COLUMN "subject",
ADD COLUMN     "chatId" TEXT NOT NULL,
ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "MessageStatus";

-- CreateTable
CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "recipientDepartment" TEXT NOT NULL,
    "status" "ChatStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chats_initiatorId_idx" ON "chats"("initiatorId");

-- CreateIndex
CREATE INDEX "chats_recipientDepartment_idx" ON "chats"("recipientDepartment");

-- CreateIndex
CREATE INDEX "chats_status_idx" ON "chats"("status");

-- CreateIndex
CREATE INDEX "chats_lastMessageAt_idx" ON "chats"("lastMessageAt");

-- CreateIndex
CREATE INDEX "messages_chatId_idx" ON "messages"("chatId");

-- CreateIndex
CREATE INDEX "messages_isRead_idx" ON "messages"("isRead");

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
