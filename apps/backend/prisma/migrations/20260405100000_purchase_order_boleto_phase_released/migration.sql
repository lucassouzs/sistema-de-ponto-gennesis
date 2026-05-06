-- Confirmação explícita para sair de "Anexar boleto" e ir à fase Pagamento
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paymentBoletoPhaseReleased" BOOLEAN NOT NULL DEFAULT false;

-- OCs que já tinham boleto de pagamento continuam na fase Pagamento
UPDATE "purchase_orders"
SET "paymentBoletoPhaseReleased" = true
WHERE (
  ("paymentBoletoUrl" IS NOT NULL AND LENGTH(TRIM("paymentBoletoUrl")) > 0)
  OR (
    "paymentBoletoInstallments" IS NOT NULL
    AND jsonb_typeof("paymentBoletoInstallments") = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements("paymentBoletoInstallments") AS elem
      WHERE (elem->>'boletoUrl') IS NOT NULL AND LENGTH(TRIM(elem->>'boletoUrl')) > 0
    )
  )
);
