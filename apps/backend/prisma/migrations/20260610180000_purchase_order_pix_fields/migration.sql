-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "pixKeyType" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "pixKey" TEXT;
