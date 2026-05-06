-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "paymentType" TEXT,
ADD COLUMN     "paymentCondition" TEXT,
ADD COLUMN     "paymentDetails" TEXT,
ADD COLUMN     "boletoAttachmentUrl" TEXT,
ADD COLUMN     "boletoAttachmentName" TEXT,
ADD COLUMN     "amountToPay" DECIMAL(15,2);
