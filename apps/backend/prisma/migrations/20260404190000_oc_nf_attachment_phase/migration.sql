-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_NF_ATTACHMENT';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "nfAttachments" JSONB;
