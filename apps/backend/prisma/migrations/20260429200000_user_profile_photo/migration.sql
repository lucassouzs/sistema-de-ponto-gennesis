-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profilePhotoUrl" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profilePhotoKey" TEXT;
