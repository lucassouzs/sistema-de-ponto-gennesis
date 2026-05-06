-- CreateTable
CREATE TABLE "budget_natures" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_natures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_natures_code_key" ON "budget_natures"("code");

-- CreateIndex
CREATE INDEX "budget_natures_code_idx" ON "budget_natures"("code");

-- CreateIndex
CREATE INDEX "budget_natures_isActive_idx" ON "budget_natures"("isActive");
