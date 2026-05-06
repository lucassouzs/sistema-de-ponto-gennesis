-- CreateTable
CREATE TABLE "chat_user_privacy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_user_privacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_hidden_for_user" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_hidden_for_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_user_privacy_userId_chatId_key" ON "chat_user_privacy"("userId", "chatId");

-- CreateIndex
CREATE INDEX "chat_user_privacy_userId_idx" ON "chat_user_privacy"("userId");

-- CreateIndex
CREATE INDEX "chat_user_privacy_chatId_idx" ON "chat_user_privacy"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "message_hidden_for_user_userId_messageId_key" ON "message_hidden_for_user"("userId", "messageId");

-- CreateIndex
CREATE INDEX "message_hidden_for_user_userId_idx" ON "message_hidden_for_user"("userId");

-- CreateIndex
CREATE INDEX "message_hidden_for_user_messageId_idx" ON "message_hidden_for_user"("messageId");

-- AddForeignKey
ALTER TABLE "chat_user_privacy" ADD CONSTRAINT "chat_user_privacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_user_privacy" ADD CONSTRAINT "chat_user_privacy_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hidden_for_user" ADD CONSTRAINT "message_hidden_for_user_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hidden_for_user" ADD CONSTRAINT "message_hidden_for_user_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
