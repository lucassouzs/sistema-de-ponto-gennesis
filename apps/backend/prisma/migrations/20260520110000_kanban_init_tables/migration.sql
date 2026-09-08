-- Kanban: criação idempotente das tabelas (antes só existiam em dev via db push).
-- Produções que só usam `prisma migrate deploy` não tinham `kanban_boards`, quebrando migrations seguintes.

DO $$ BEGIN
  CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_boards" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Tasks',
  "slug" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kanban_boards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kanban_boards_slug_key" ON "kanban_boards"("slug");

DO $$ BEGIN
  ALTER TABLE "kanban_boards"
    ADD CONSTRAINT "kanban_boards_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_columns" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6B7280',
  "position" INTEGER NOT NULL DEFAULT 0,
  "cardLimit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kanban_columns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kanban_columns_boardId_idx" ON "kanban_columns"("boardId");

DO $$ BEGIN
  ALTER TABLE "kanban_columns"
    ADD CONSTRAINT "kanban_columns_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "kanban_boards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_cards" (
  "id" TEXT NOT NULL,
  "columnId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "assigneeUserId" TEXT,
  "assigneeName" TEXT,
  "totalTasks" INTEGER NOT NULL DEFAULT 0,
  "completedTasks" INTEGER NOT NULL DEFAULT 0,
  "checklistEnabled" BOOLEAN NOT NULL DEFAULT false,
  "attachmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "labels" JSONB NOT NULL DEFAULT '[]',
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kanban_cards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kanban_cards_columnId_idx" ON "kanban_cards"("columnId");
CREATE INDEX IF NOT EXISTS "kanban_cards_assigneeUserId_idx" ON "kanban_cards"("assigneeUserId");

DO $$ BEGIN
  ALTER TABLE "kanban_cards"
    ADD CONSTRAINT "kanban_cards_columnId_fkey"
    FOREIGN KEY ("columnId") REFERENCES "kanban_columns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kanban_cards"
    ADD CONSTRAINT "kanban_cards_assigneeUserId_fkey"
    FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_card_members" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kanban_card_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kanban_card_members_cardId_userId_key" ON "kanban_card_members"("cardId", "userId");
CREATE INDEX IF NOT EXISTS "kanban_card_members_cardId_idx" ON "kanban_card_members"("cardId");
CREATE INDEX IF NOT EXISTS "kanban_card_members_userId_idx" ON "kanban_card_members"("userId");

DO $$ BEGIN
  ALTER TABLE "kanban_card_members"
    ADD CONSTRAINT "kanban_card_members_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kanban_card_members"
    ADD CONSTRAINT "kanban_card_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_checklist_items" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "assigneeUserId" TEXT,
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kanban_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kanban_checklist_items_cardId_idx" ON "kanban_checklist_items"("cardId");
CREATE INDEX IF NOT EXISTS "kanban_checklist_items_assigneeUserId_idx" ON "kanban_checklist_items"("assigneeUserId");

DO $$ BEGIN
  ALTER TABLE "kanban_checklist_items"
    ADD CONSTRAINT "kanban_checklist_items_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kanban_checklist_items"
    ADD CONSTRAINT "kanban_checklist_items_assigneeUserId_fkey"
    FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_card_comments" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kanban_card_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kanban_card_comments_cardId_idx" ON "kanban_card_comments"("cardId");
CREATE INDEX IF NOT EXISTS "kanban_card_comments_userId_idx" ON "kanban_card_comments"("userId");

DO $$ BEGIN
  ALTER TABLE "kanban_card_comments"
    ADD CONSTRAINT "kanban_card_comments_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kanban_card_comments"
    ADD CONSTRAINT "kanban_card_comments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kanban_card_attachments" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileKey" TEXT,
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kanban_card_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kanban_card_attachments_cardId_idx" ON "kanban_card_attachments"("cardId");
CREATE INDEX IF NOT EXISTS "kanban_card_attachments_userId_idx" ON "kanban_card_attachments"("userId");

DO $$ BEGIN
  ALTER TABLE "kanban_card_attachments"
    ADD CONSTRAINT "kanban_card_attachments_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kanban_card_attachments"
    ADD CONSTRAINT "kanban_card_attachments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
