-- CreateTable
CREATE TABLE "payroll_status" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_status_month_year_key" ON "payroll_status"("month", "year");

-- CreateIndex
CREATE INDEX "payroll_status_month_year_idx" ON "payroll_status"("month", "year");

-- CreateIndex
CREATE INDEX "payroll_status_isFinalized_idx" ON "payroll_status"("isFinalized");

-- AddForeignKey
ALTER TABLE "payroll_status" ADD CONSTRAINT "payroll_status_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

