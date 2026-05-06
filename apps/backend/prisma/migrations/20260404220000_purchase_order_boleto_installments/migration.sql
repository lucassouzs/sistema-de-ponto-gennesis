-- Boletos por parcela (condição de pagamento com N parcelas)
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paymentBoletoInstallments" JSONB;
