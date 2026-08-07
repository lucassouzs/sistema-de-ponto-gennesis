-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActivityPath" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActivityLabel" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_page_visits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_page_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_login_events_userId_createdAt_idx" ON "user_login_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_page_visits_userId_createdAt_idx" ON "user_page_visits"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_page_visits_userId_path_createdAt_idx" ON "user_page_visits"("userId", "path", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "user_login_events" ADD CONSTRAINT "user_login_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_page_visits" ADD CONSTRAINT "user_page_visits_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
