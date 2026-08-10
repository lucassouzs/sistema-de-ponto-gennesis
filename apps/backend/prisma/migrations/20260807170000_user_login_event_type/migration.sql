-- AlterTable
ALTER TABLE "user_login_events" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'login';
