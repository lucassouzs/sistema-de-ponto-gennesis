-- Registro de números de NF por OC (unicidade global entre ordens de compra)
CREATE TABLE "purchase_order_invoice_numbers" (
    "id" TEXT NOT NULL,
    "numberKey" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_invoice_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_order_invoice_numbers_numberKey_key" ON "purchase_order_invoice_numbers"("numberKey");
CREATE INDEX "purchase_order_invoice_numbers_purchaseOrderId_idx" ON "purchase_order_invoice_numbers"("purchaseOrderId");

ALTER TABLE "purchase_order_invoice_numbers"
  ADD CONSTRAINT "purchase_order_invoice_numbers_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
