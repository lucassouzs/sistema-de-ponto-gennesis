-- CreateEnum
CREATE TYPE "ToolRentalLogisticsMode" AS ENUM (
  'ENTREGA_LOGISTICA',
  'RETIRADA_LOGISTICA',
  'ENTREGA_FORNECEDOR',
  'RETIRADA_FORNECEDOR'
);

-- AlterTable: modalidade logística
ALTER TABLE "tool_rental_requests"
ADD COLUMN "logisticsMode" "ToolRentalLogisticsMode";

UPDATE "tool_rental_requests"
SET "logisticsMode" = 'RETIRADA_LOGISTICA'
WHERE "logisticsMode" IS NULL;

ALTER TABLE "tool_rental_requests"
ALTER COLUMN "logisticsMode" SET NOT NULL;

-- AlterEnum: prioridade Normal / Urgente
CREATE TYPE "ToolRentalPriority_new" AS ENUM ('NORMAL', 'URGENT');

ALTER TABLE "tool_rental_requests" ALTER COLUMN "priority" DROP DEFAULT;

ALTER TABLE "tool_rental_requests"
ALTER COLUMN "priority" TYPE "ToolRentalPriority_new"
USING (
  CASE
    WHEN "priority"::text IN ('HIGH', 'URGENT') THEN 'URGENT'::"ToolRentalPriority_new"
    ELSE 'NORMAL'::"ToolRentalPriority_new"
  END
);

DROP TYPE "ToolRentalPriority";

ALTER TYPE "ToolRentalPriority_new" RENAME TO "ToolRentalPriority";

ALTER TABLE "tool_rental_requests"
ALTER COLUMN "priority" SET DEFAULT 'NORMAL'::"ToolRentalPriority";
