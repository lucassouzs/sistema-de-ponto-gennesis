-- AlterTable
ALTER TABLE "payment_conditions" ADD COLUMN "parcelCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payment_conditions" ADD COLUMN "parcelDueDays" JSONB NOT NULL DEFAULT '[0]'::jsonb;

UPDATE "payment_conditions" SET "parcelCount" = 1, "parcelDueDays" = '[0]'::jsonb WHERE "code" = 'AVISTA';
UPDATE "payment_conditions" SET "parcelCount" = 1, "parcelDueDays" = '[30]'::jsonb WHERE "code" = 'BOLETO_30';
UPDATE "payment_conditions" SET "parcelCount" = 1, "parcelDueDays" = '[28]'::jsonb WHERE "code" = 'BOLETO_28';
