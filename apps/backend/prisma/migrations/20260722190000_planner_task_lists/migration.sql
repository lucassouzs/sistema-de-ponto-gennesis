-- CreateTable
CREATE TABLE "planner_task_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_task_lists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "planner_task_lists_userId_position_idx" ON "planner_task_lists"("userId", "position");

ALTER TABLE "planner_task_lists" ADD CONSTRAINT "planner_task_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "planner_tasks" ADD COLUMN "listId" TEXT;

INSERT INTO "planner_task_lists" ("id", "userId", "title", "position", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."userId",
  'Minhas tarefas',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId" FROM "planner_tasks") u;

UPDATE "planner_tasks" t
SET "listId" = l."id"
FROM "planner_task_lists" l
WHERE t."userId" = l."userId"
  AND t."listId" IS NULL
  AND l."title" = 'Minhas tarefas';

DELETE FROM "planner_tasks" WHERE "listId" IS NULL;

ALTER TABLE "planner_tasks" ALTER COLUMN "listId" SET NOT NULL;

CREATE INDEX "planner_tasks_listId_completed_position_idx" ON "planner_tasks"("listId", "completed", "position");

ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_listId_fkey" FOREIGN KEY ("listId") REFERENCES "planner_task_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;