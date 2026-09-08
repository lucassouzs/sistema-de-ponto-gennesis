ALTER TABLE "material_requests"
  ADD COLUMN IF NOT EXISTS "demandSheet" TEXT,
  ADD COLUMN IF NOT EXISTS "demandSheetAttachmentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "demandSheetAttachmentName" TEXT;
