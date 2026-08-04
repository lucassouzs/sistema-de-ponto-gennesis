-- AlterTable
ALTER TABLE "planner_events" ADD COLUMN IF NOT EXISTS "icon" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "planner_event_attendees" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_event_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "planner_event_attendees_event_id_user_id_key" ON "planner_event_attendees"("event_id", "user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planner_event_attendees_user_id_idx" ON "planner_event_attendees"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planner_event_attendees_event_id_idx" ON "planner_event_attendees"("event_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "planner_event_attendees"
    ADD CONSTRAINT "planner_event_attendees_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "planner_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "planner_event_attendees"
    ADD CONSTRAINT "planner_event_attendees_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
