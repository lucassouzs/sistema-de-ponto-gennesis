-- Número sequencial amigável para solicitações DP (ordem de criação).
ALTER TABLE "dp_requests" ADD COLUMN "displayNumber" INTEGER;

UPDATE "dp_requests" AS d
SET "displayNumber" = o.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "createdAt" ASC))::integer AS rn
  FROM "dp_requests"
) AS o
WHERE d.id = o.id;

ALTER TABLE "dp_requests" ALTER COLUMN "displayNumber" SET NOT NULL;

CREATE UNIQUE INDEX "dp_requests_displayNumber_key" ON "dp_requests"("displayNumber");
