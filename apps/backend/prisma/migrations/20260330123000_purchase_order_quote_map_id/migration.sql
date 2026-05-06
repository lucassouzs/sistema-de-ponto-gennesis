-- Add quoteMapId to purchase_orders
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "quoteMapId" TEXT;

-- Foreign key to quote_maps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_quoteMapId_fkey'
  ) THEN
    ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "purchase_orders_quoteMapId_fkey"
      FOREIGN KEY ("quoteMapId") REFERENCES "quote_maps"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "purchase_orders_quoteMapId_idx" ON "purchase_orders"("quoteMapId");

