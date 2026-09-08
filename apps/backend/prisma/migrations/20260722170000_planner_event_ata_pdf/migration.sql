-- AlterTable
ALTER TABLE "planner_events" ADD COLUMN IF NOT EXISTS "ata_file_name" TEXT;
ALTER TABLE "planner_events" ADD COLUMN IF NOT EXISTS "ata_file_url" TEXT;
ALTER TABLE "planner_events" ADD COLUMN IF NOT EXISTS "ata_file_key" TEXT;
ALTER TABLE "planner_events" ADD COLUMN IF NOT EXISTS "ata_file_size" INTEGER;
ALTER TABLE "planner_events" ADD COLUMN IF NOT EXISTS "ata_mime_type" TEXT;
