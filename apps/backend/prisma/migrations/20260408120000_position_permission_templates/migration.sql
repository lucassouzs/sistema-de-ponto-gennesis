-- CreateTable
CREATE TABLE "position_permission_templates" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "allowedContractIds" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_permission_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "position_permission_templates_position_key" ON "position_permission_templates"("position");
