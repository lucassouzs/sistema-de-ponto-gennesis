-- CreateEnum
CREATE TYPE "VehicleUsageType" AS ENUM ('FROTA', 'PARTICULAR');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "modeloVeic" TEXT NOT NULL,
    "placaVeic" TEXT NOT NULL,
    "polo" TEXT,
    "projeto" TEXT,
    "responsavel" TEXT,
    "frotaPartic" "VehicleUsageType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_code_key" ON "vehicles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_placaVeic_key" ON "vehicles"("placaVeic");

-- CreateIndex
CREATE INDEX "vehicles_code_idx" ON "vehicles"("code");

-- CreateIndex
CREATE INDEX "vehicles_placaVeic_idx" ON "vehicles"("placaVeic");

-- CreateIndex
CREATE INDEX "vehicles_isActive_idx" ON "vehicles"("isActive");
