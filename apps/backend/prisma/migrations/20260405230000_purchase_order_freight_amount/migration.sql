-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "freightAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Legado: frete inferido (não negativo) a partir do total e da soma dos itens
UPDATE "purchase_orders" po
SET "freightAmount" = GREATEST(
  0::numeric,
  COALESCE(po."amountToPay", 0) - COALESCE(agg.items_sum, 0)
)
FROM (
  SELECT "purchaseOrderId", SUM("totalPrice")::numeric AS items_sum
  FROM "purchase_order_items"
  GROUP BY "purchaseOrderId"
) AS agg
WHERE po.id = agg."purchaseOrderId";

-- Alinhar total a pagar = soma dos itens + frete (quando há itens)
UPDATE "purchase_orders" po
SET "amountToPay" = ROUND(COALESCE(agg.items_sum, 0) + COALESCE(po."freightAmount", 0), 2)
FROM (
  SELECT "purchaseOrderId", SUM("totalPrice")::numeric AS items_sum
  FROM "purchase_order_items"
  GROUP BY "purchaseOrderId"
) AS agg
WHERE po.id = agg."purchaseOrderId";
