-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_entity_createdAt_idx" ON "audit_logs"("entity", "createdAt");
