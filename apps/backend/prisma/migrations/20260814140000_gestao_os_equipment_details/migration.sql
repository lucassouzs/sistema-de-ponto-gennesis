-- AlterTable
ALTER TABLE "gestao_os_equipments" ADD COLUMN IF NOT EXISTS "defaultSlaHours" INTEGER;
ALTER TABLE "gestao_os_equipments" ADD COLUMN IF NOT EXISTS "expectedLifeYears" INTEGER;
ALTER TABLE "gestao_os_equipments" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "gestao_os_equipments" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
