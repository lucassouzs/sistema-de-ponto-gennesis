-- Vínculo opcional da RM com ordem de serviço (campo já usado pelo Prisma, faltava no banco de produção).
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "material_requests_serviceOrderId_idx" ON "material_requests"("serviceOrderId");

DO $$
BEGIN
  ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_serviceOrderId_fkey"
    FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
