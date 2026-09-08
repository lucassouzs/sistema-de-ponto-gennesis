-- Add extra registration fields for construction materials
ALTER TABLE "construction_materials"
ADD COLUMN "category" TEXT,
ADD COLUMN "dimensions" TEXT,
ADD COLUMN "productImageUrl" TEXT,
ADD COLUMN "productImageName" TEXT;
