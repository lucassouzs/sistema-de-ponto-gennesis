-- CreateTable
CREATE TABLE "gestao_os_equipment_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gestao_os_equipment_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestao_os_equipment_subgroups" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gestao_os_equipment_subgroups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestao_os_equipments" (
    "id" TEXT NOT NULL,
    "subgroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gestao_os_equipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gestao_os_equipment_groups_name_idx" ON "gestao_os_equipment_groups"("name");

-- CreateIndex
CREATE INDEX "gestao_os_equipment_subgroups_groupId_idx" ON "gestao_os_equipment_subgroups"("groupId");

-- CreateIndex
CREATE INDEX "gestao_os_equipment_subgroups_name_idx" ON "gestao_os_equipment_subgroups"("name");

-- CreateIndex
CREATE INDEX "gestao_os_equipments_subgroupId_idx" ON "gestao_os_equipments"("subgroupId");

-- CreateIndex
CREATE INDEX "gestao_os_equipments_name_idx" ON "gestao_os_equipments"("name");

-- AddForeignKey
ALTER TABLE "gestao_os_equipment_subgroups" ADD CONSTRAINT "gestao_os_equipment_subgroups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "gestao_os_equipment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestao_os_equipments" ADD CONSTRAINT "gestao_os_equipments_subgroupId_fkey" FOREIGN KEY ("subgroupId") REFERENCES "gestao_os_equipment_subgroups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
