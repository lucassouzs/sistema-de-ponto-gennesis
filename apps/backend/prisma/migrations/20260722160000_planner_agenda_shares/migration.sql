-- CreateEnum
CREATE TYPE "PlannerAgendaSharePermission" AS ENUM ('READ', 'WRITE');

-- CreateTable
CREATE TABLE "planner_agenda_shares" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT NOT NULL,
    "permission" "PlannerAgendaSharePermission" NOT NULL DEFAULT 'READ',
    "created_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_agenda_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planner_agenda_shares_shared_with_user_id_idx" ON "planner_agenda_shares"("shared_with_user_id");

-- CreateIndex
CREATE INDEX "planner_agenda_shares_owner_id_idx" ON "planner_agenda_shares"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "planner_agenda_shares_owner_id_shared_with_user_id_key" ON "planner_agenda_shares"("owner_id", "shared_with_user_id");

-- AddForeignKey
ALTER TABLE "planner_agenda_shares" ADD CONSTRAINT "planner_agenda_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_agenda_shares" ADD CONSTRAINT "planner_agenda_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_agenda_shares" ADD CONSTRAINT "planner_agenda_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
