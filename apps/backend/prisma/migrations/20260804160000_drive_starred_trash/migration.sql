-- Drive: starred + soft-delete (lixeira)
ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3);

ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "drive_folders_ownerId_trashedAt_idx" ON "drive_folders"("ownerId", "trashedAt");
CREATE INDEX IF NOT EXISTS "drive_folders_starred_idx" ON "drive_folders"("starred");

CREATE INDEX IF NOT EXISTS "drive_files_ownerId_trashedAt_idx" ON "drive_files"("ownerId", "trashedAt");
CREATE INDEX IF NOT EXISTS "drive_files_starred_idx" ON "drive_files"("starred");
CREATE INDEX IF NOT EXISTS "drive_files_updatedAt_idx" ON "drive_files"("updatedAt");
