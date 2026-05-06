-- Persistir Ordem de Serviço (texto livre) na RM
DO $$
BEGIN
  ALTER TABLE "material_requests" ADD COLUMN "serviceOrder" TEXT;
EXCEPTION
  WHEN duplicate_column THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS "material_requests_serviceOrder_idx" ON "material_requests"("serviceOrder");

