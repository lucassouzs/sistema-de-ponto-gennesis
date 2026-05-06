-- CreateTable
CREATE TABLE "drive_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "folderId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drive_folders_parentId_idx" ON "drive_folders"("parentId");

-- CreateIndex
CREATE INDEX "drive_folders_ownerId_idx" ON "drive_folders"("ownerId");

-- CreateIndex
CREATE INDEX "drive_files_folderId_idx" ON "drive_files"("folderId");

-- CreateIndex
CREATE INDEX "drive_files_ownerId_idx" ON "drive_files"("ownerId");

-- AddForeignKey
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "drive_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "drive_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
