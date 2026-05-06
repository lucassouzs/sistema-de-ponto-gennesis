-- Enums (idempotente: permite dev onde o tipo já existe sem migração)
DO $$
BEGIN
    CREATE TYPE "ChatType" AS ENUM ('DEPARTMENT', 'DIRECT', 'GROUP');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "DriveFolderSharePermission" AS ENUM ('READ', 'READ_WRITE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Colunas em chats (incremental sobre DBs já parcialmente sincronizados)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'chatType'
    ) THEN
        ALTER TABLE "chats" ADD COLUMN "chatType" "ChatType" NOT NULL DEFAULT 'DEPARTMENT';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = 'chats' AND c.column_name = 'recipientDepartment' AND c.is_nullable = 'NO'
    ) THEN
        ALTER TABLE "chats" ALTER COLUMN "recipientDepartment" DROP NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'groupName'
    ) THEN
        ALTER TABLE "chats" ADD COLUMN "groupName" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'groupDescription'
    ) THEN
        ALTER TABLE "chats" ADD COLUMN "groupDescription" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'groupAvatarUrl'
    ) THEN
        ALTER TABLE "chats" ADD COLUMN "groupAvatarUrl" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'recipientId'
    ) THEN
        ALTER TABLE "chats" ADD COLUMN "recipientId" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'pinnedMessageId'
    ) THEN
        ALTER TABLE "chats" ADD COLUMN "pinnedMessageId" TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "chats_chatType_idx" ON "chats"("chatType");

CREATE INDEX IF NOT EXISTS "chats_groupName_idx" ON "chats"("groupName");

CREATE TABLE IF NOT EXISTS "chat_participants" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_participants_chatId_userId_key" ON "chat_participants"("chatId", "userId");

CREATE INDEX IF NOT EXISTS "chat_participants_chatId_idx" ON "chat_participants"("chatId");

CREATE INDEX IF NOT EXISTS "chat_participants_userId_idx" ON "chat_participants"("userId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chats_recipientId_fkey') THEN
        ALTER TABLE "chats" ADD CONSTRAINT "chats_recipientId_fkey"
            FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chats_pinnedMessageId_fkey') THEN
        ALTER TABLE "chats" ADD CONSTRAINT "chats_pinnedMessageId_fkey"
            FOREIGN KEY ("pinnedMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_participants_chatId_fkey') THEN
        ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_chatId_fkey"
            FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_participants_userId_fkey') THEN
        ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "drive_folder_shares" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "DriveFolderSharePermission" NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "drive_folder_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "drive_folder_shares_folderId_userId_key" ON "drive_folder_shares"("folderId", "userId");

CREATE INDEX IF NOT EXISTS "drive_folder_shares_userId_idx" ON "drive_folder_shares"("userId");

CREATE INDEX IF NOT EXISTS "drive_folder_shares_folderId_idx" ON "drive_folder_shares"("folderId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drive_folder_shares_folderId_fkey') THEN
        ALTER TABLE "drive_folder_shares" ADD CONSTRAINT "drive_folder_shares_folderId_fkey"
            FOREIGN KEY ("folderId") REFERENCES "drive_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drive_folder_shares_userId_fkey') THEN
        ALTER TABLE "drive_folder_shares" ADD CONSTRAINT "drive_folder_shares_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drive_folder_shares_createdBy_fkey') THEN
        ALTER TABLE "drive_folder_shares" ADD CONSTRAINT "drive_folder_shares_createdBy_fkey"
            FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
