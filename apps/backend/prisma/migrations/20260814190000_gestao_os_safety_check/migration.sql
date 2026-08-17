ALTER TYPE "GestaoOsStatus" ADD VALUE IF NOT EXISTS 'SAFETY_CHECK';

ALTER TABLE "gestao_os_work_orders" ADD COLUMN IF NOT EXISTS "safetyChecklistResponses" JSONB;
ALTER TABLE "gestao_os_work_orders" ADD COLUMN IF NOT EXISTS "safetyPhotoUrl" TEXT;
