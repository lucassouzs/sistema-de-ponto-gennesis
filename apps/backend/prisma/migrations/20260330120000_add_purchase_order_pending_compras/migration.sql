-- AlterEnum: fase inicial de aprovação da OC (compras)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PurchaseOrderStatus'
      AND e.enumlabel = 'PENDING_COMPRAS'
  ) THEN
    ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_COMPRAS';
  END IF;
END$$;
