-- AlterEnum: CORREÇÃO OC e reprovação
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'REJECTED';

-- Novas OC nascem pendentes de aprovação (rascunhos antigos permanecem DRAFT)
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';
