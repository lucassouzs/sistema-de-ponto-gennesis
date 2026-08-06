-- CreateTable
CREATE TABLE "tool_rental_request_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "ToolRentalRequestStatus",
    "toStatus" "ToolRentalRequestStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_rental_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_rental_request_events_requestId_createdAt_idx"
ON "tool_rental_request_events"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "tool_rental_request_events"
ADD CONSTRAINT "tool_rental_request_events_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "tool_rental_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental_request_events"
ADD CONSTRAINT "tool_rental_request_events_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: abertura registrada para solicitações já existentes
INSERT INTO "tool_rental_request_events" ("id", "requestId", "fromStatus", "toStatus", "note", "actorId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || r."id"),
  r."id",
  NULL,
  'OPEN'::"ToolRentalRequestStatus",
  'Solicitação aberta',
  r."createdById",
  r."createdAt"
FROM "tool_rental_requests" r
WHERE NOT EXISTS (
  SELECT 1 FROM "tool_rental_request_events" e WHERE e."requestId" = r."id"
);
