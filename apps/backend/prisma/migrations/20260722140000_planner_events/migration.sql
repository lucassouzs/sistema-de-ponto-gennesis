-- CreateTable
CREATE TABLE "planner_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planner_events_userId_startAt_idx" ON "planner_events"("userId", "startAt");

-- CreateIndex
CREATE INDEX "planner_events_userId_endAt_idx" ON "planner_events"("userId", "endAt");

-- AddForeignKey
ALTER TABLE "planner_events" ADD CONSTRAINT "planner_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
