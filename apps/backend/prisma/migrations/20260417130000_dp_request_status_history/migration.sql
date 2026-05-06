-- AlterTable
ALTER TABLE "dp_requests" ADD COLUMN "statusHistory" JSONB NOT NULL DEFAULT '[]';
