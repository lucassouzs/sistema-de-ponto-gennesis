-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "pixKeyType" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "pixKey" TEXT;
