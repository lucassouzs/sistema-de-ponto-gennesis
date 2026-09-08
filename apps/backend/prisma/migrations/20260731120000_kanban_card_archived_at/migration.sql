-- Soft-archive de cards do Kanban (estilo Trello).
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
