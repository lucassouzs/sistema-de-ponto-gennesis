-- AlterTable
ALTER TABLE "help_tutorials" ADD COLUMN IF NOT EXISTS "content_type" TEXT NOT NULL DEFAULT 'STEPS';
ALTER TABLE "help_tutorials" ADD COLUMN IF NOT EXISTS "markdown" TEXT;
