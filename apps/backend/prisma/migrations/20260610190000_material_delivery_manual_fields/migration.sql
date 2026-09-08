-- Previsão e tipo de entrega são preenchidos manualmente pelo time de suprimentos na listagem.
-- Limpa valores que foram gerados automaticamente ao sincronizar com a OC.
UPDATE "material_deliveries"
SET
  "expectedDelivery" = NULL,
  "deliveryType" = NULL
WHERE
  "purchaseOrderId" IS NOT NULL
  AND "receivedByEngineering" = false;
