-- CreateTable
CREATE TABLE "pncp_sync_uf_states" (
    "uf" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastDataFinal" TEXT,
    "lastStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastErrorMessage" TEXT,
    "lastRunId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pncp_sync_uf_states_pkey" PRIMARY KEY ("uf")
);

-- CreateIndex
CREATE INDEX "pncp_sync_uf_states_lastStatus_idx" ON "pncp_sync_uf_states"("lastStatus");

-- CreateIndex
CREATE INDEX "pncp_sync_uf_states_lastSuccessAt_idx" ON "pncp_sync_uf_states"("lastSuccessAt");
