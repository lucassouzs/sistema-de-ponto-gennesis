-- Novo status: validação do comprovante de pagamento
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_PROOF_VALIDATION';

-- Comprovante de pagamento (fase Pagamento)
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paymentProofUrl" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paymentProofName" TEXT;
