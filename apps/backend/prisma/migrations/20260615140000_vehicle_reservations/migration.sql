-- CreateTable
CREATE TABLE "vehicle_reservations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "solicitante" TEXT NOT NULL,
    "motorista" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "atividade" TEXT NOT NULL,
    "localDestino" TEXT NOT NULL,
    "dataUsoInicio" DATE NOT NULL,
    "dataUsoFim" DATE NOT NULL,
    "periodoUso" JSONB NOT NULL DEFAULT '[]',
    "polo" TEXT,
    "contrato" TEXT,
    "assinatura" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_reservations_code_key" ON "vehicle_reservations"("code");

-- CreateIndex
CREATE INDEX "vehicle_reservations_vehicleId_idx" ON "vehicle_reservations"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_reservations_dataUsoInicio_idx" ON "vehicle_reservations"("dataUsoInicio");

-- CreateIndex
CREATE INDEX "vehicle_reservations_createdById_idx" ON "vehicle_reservations"("createdById");

-- AddForeignKey
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
