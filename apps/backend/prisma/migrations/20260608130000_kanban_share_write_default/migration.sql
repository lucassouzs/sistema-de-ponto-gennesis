-- Convites ao quadro passam a conceder edição completa por padrão
UPDATE "kanban_board_shares" SET "permission" = 'WRITE' WHERE "permission" = 'READ';

ALTER TABLE "kanban_board_shares" ALTER COLUMN "permission" SET DEFAULT 'WRITE';
