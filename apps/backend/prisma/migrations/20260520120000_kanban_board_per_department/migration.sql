-- Quadro Kanban por setor (department_key único por board)

ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "department_key" TEXT;
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "department_label" TEXT;

UPDATE "kanban_boards"
SET
  "department_key" = COALESCE("department_key", 'LEGADO'),
  "department_label" = COALESCE("department_label", 'Legado'),
  "slug" = CASE WHEN "slug" = 'default' THEN 'legado' ELSE "slug" END
WHERE "department_key" IS NULL OR "department_label" IS NULL;

ALTER TABLE "kanban_boards" ALTER COLUMN "department_key" SET NOT NULL;
ALTER TABLE "kanban_boards" ALTER COLUMN "department_label" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "kanban_boards_department_key_key" ON "kanban_boards"("department_key");
