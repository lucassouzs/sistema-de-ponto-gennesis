-- CreateTable
CREATE TABLE IF NOT EXISTS "gestao_os_work_order_comments" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestao_os_work_order_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "gestao_os_work_order_comments_workOrderId_idx" ON "gestao_os_work_order_comments"("workOrderId");
CREATE INDEX IF NOT EXISTS "gestao_os_work_order_comments_userId_idx" ON "gestao_os_work_order_comments"("userId");

DO $$ BEGIN
  ALTER TABLE "gestao_os_work_order_comments"
    ADD CONSTRAINT "gestao_os_work_order_comments_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "gestao_os_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gestao_os_work_order_comments"
    ADD CONSTRAINT "gestao_os_work_order_comments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
