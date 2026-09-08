-- Persiste o centro de custo escolhido no formulário de solicitações gerais.
ALTER TABLE "dp_requests" ADD COLUMN "costCenterId" TEXT;

ALTER TABLE "dp_requests"
  ADD CONSTRAINT "dp_requests_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "dp_requests_costCenterId_idx" ON "dp_requests"("costCenterId");
