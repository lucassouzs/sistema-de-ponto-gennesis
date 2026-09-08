-- Horas e data de conclusão para cálculo de custo da demanda
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "workHours" DECIMAL(8,2);
