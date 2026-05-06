-- Tabela correspondente ao model MessageFavorite (existia apenas no schema, sem migration)
CREATE TABLE "message_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_favorites_userId_messageId_key" ON "message_favorites"("userId", "messageId");

CREATE INDEX "message_favorites_userId_idx" ON "message_favorites"("userId");

CREATE INDEX "message_favorites_messageId_idx" ON "message_favorites"("messageId");

ALTER TABLE "message_favorites" ADD CONSTRAINT "message_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_favorites" ADD CONSTRAINT "message_favorites_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
