-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "comprasApprovedBy" TEXT,
ADD COLUMN "comprasApprovedAt" TIMESTAMP(3),
ADD COLUMN "gestorApprovedBy" TEXT,
ADD COLUMN "gestorApprovedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_comprasApprovedBy_fkey" FOREIGN KEY ("comprasApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_gestorApprovedBy_fkey" FOREIGN KEY ("gestorApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
