-- CreateTable
CREATE TABLE "payment_conditions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_conditions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_conditions_code_key" ON "payment_conditions"("code");

CREATE INDEX "payment_conditions_paymentType_isActive_idx" ON "payment_conditions"("paymentType", "isActive");
