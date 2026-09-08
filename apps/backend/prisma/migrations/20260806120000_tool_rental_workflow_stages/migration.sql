-- Novo enum de status do fluxo real (SC → OC → pagamento)
CREATE TYPE "ToolRentalRequestStatus_new" AS ENUM (
  'OPEN',
  'SUPPLIER_RELATION',
  'AWAITING_PAYMENT',
  'COMPLETED',
  'REJECTED',
  'CANCELLED'
);

ALTER TABLE "tool_rental_requests" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "tool_rental_requests"
ALTER COLUMN "status" TYPE "ToolRentalRequestStatus_new"
USING (
  CASE "status"::text
    WHEN 'PENDING_SUPPLIES' THEN 'OPEN'::"ToolRentalRequestStatus_new"
    WHEN 'APPROVED' THEN 'SUPPLIER_RELATION'::"ToolRentalRequestStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"ToolRentalRequestStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"ToolRentalRequestStatus_new"
    ELSE 'OPEN'::"ToolRentalRequestStatus_new"
  END
);

DROP TYPE "ToolRentalRequestStatus";
ALTER TYPE "ToolRentalRequestStatus_new" RENAME TO "ToolRentalRequestStatus";

ALTER TABLE "tool_rental_requests"
ALTER COLUMN "status" SET DEFAULT 'OPEN'::"ToolRentalRequestStatus";

-- Anexos: espelho da OC e comprovante de pagamento
ALTER TABLE "tool_rental_requests"
ADD COLUMN IF NOT EXISTS "ocMirrorUrl" TEXT,
ADD COLUMN IF NOT EXISTS "ocMirrorName" TEXT,
ADD COLUMN IF NOT EXISTS "paymentProofUrl" TEXT,
ADD COLUMN IF NOT EXISTS "paymentProofName" TEXT;
