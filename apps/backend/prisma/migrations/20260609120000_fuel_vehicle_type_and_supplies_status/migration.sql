-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FuelVehicleType" AS ENUM ('PRIVATE', 'COMPANY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum (must be committed before use in UPDATE — Prisma migrate runs per file)
ALTER TYPE "FuelRefuelRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_SUPPLIES';
