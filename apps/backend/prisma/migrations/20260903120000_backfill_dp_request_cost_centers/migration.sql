-- Backfill: solicitações DP legadas (só contractId) passam a ter costCenterId do contrato.
UPDATE "dp_requests" AS dr
SET
  "costCenterId" = c."costCenterId",
  "updatedAt" = NOW()
FROM "contracts" AS c
WHERE dr."contractId" = c."id"
  AND dr."costCenterId" IS NULL
  AND c."costCenterId" IS NOT NULL;

-- Completa company/polo vazios a partir do centro de custo já vinculado.
UPDATE "dp_requests" AS dr
SET
  "company" = CASE
    WHEN dr."company" IS NULL OR BTRIM(dr."company") = '' THEN cc."company"
    ELSE dr."company"
  END,
  "polo" = CASE
    WHEN dr."polo" IS NULL OR BTRIM(dr."polo") = '' THEN cc."polo"
    ELSE dr."polo"
  END,
  "updatedAt" = NOW()
FROM "cost_centers" AS cc
WHERE dr."costCenterId" = cc."id"
  AND (
    dr."company" IS NULL OR BTRIM(dr."company") = ''
    OR dr."polo" IS NULL OR BTRIM(dr."polo") = ''
  );
