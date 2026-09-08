-- Quadros personalizados com compartilhamento por usuário

CREATE TYPE "KanbanBoardSharePermission" AS ENUM ('READ', 'WRITE');

ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "kanban_boards_is_custom_idx" ON "kanban_boards"("is_custom");
CREATE INDEX IF NOT EXISTS "kanban_boards_createdById_idx" ON "kanban_boards"("createdById");

CREATE TABLE IF NOT EXISTS "kanban_board_shares" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "KanbanBoardSharePermission" NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "kanban_board_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kanban_board_shares_board_id_user_id_key" ON "kanban_board_shares"("board_id", "user_id");
CREATE INDEX IF NOT EXISTS "kanban_board_shares_user_id_idx" ON "kanban_board_shares"("user_id");
CREATE INDEX IF NOT EXISTS "kanban_board_shares_board_id_idx" ON "kanban_board_shares"("board_id");

ALTER TABLE "kanban_board_shares" DROP CONSTRAINT IF EXISTS "kanban_board_shares_board_id_fkey";
ALTER TABLE "kanban_board_shares" ADD CONSTRAINT "kanban_board_shares_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kanban_board_shares" DROP CONSTRAINT IF EXISTS "kanban_board_shares_user_id_fkey";
ALTER TABLE "kanban_board_shares" ADD CONSTRAINT "kanban_board_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kanban_board_shares" DROP CONSTRAINT IF EXISTS "kanban_board_shares_created_by_fkey";
ALTER TABLE "kanban_board_shares" ADD CONSTRAINT "kanban_board_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
