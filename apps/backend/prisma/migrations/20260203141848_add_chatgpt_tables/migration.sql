-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PLANNING', 'SUSPENDED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialRequestPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MaterialRequestItemStatus" AS ENUM ('PENDING', 'APPROVED', 'PURCHASED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "costCenterId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "projectId" TEXT,
    "description" TEXT,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "MaterialRequestPriority" NOT NULL DEFAULT 'MEDIUM',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_request_items" (
    "id" TEXT NOT NULL,
    "materialRequestId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2),
    "totalPrice" DECIMAL(12,2),
    "notes" TEXT,
    "status" "MaterialRequestItemStatus" NOT NULL DEFAULT 'PENDING',
    "fulfilledQuantity" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_materials" (
    "id" TEXT NOT NULL,
    "sinapiCode" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "medianPrice" DECIMAL(12,2),
    "state" TEXT,
    "referenceMonth" INTEGER,
    "referenceYear" INTEGER,
    "categoryId" TEXT,
    "costCenterId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compositions" (
    "id" TEXT NOT NULL,
    "sinapiCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "compositePrice" DECIMAL(12,2),
    "state" TEXT,
    "referenceMonth" INTEGER,
    "referenceYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "materialId" TEXT,
    "compositionId" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SINAPI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatgpt_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatgpt_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatgpt_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatgpt_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_code_idx" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_costCenterId_idx" ON "projects"("costCenterId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_isActive_idx" ON "projects"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "material_requests_requestNumber_key" ON "material_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "material_requests_requestNumber_idx" ON "material_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "material_requests_requestedBy_idx" ON "material_requests"("requestedBy");

-- CreateIndex
CREATE INDEX "material_requests_costCenterId_idx" ON "material_requests"("costCenterId");

-- CreateIndex
CREATE INDEX "material_requests_projectId_idx" ON "material_requests"("projectId");

-- CreateIndex
CREATE INDEX "material_requests_status_idx" ON "material_requests"("status");

-- CreateIndex
CREATE INDEX "material_requests_requestedAt_idx" ON "material_requests"("requestedAt");

-- CreateIndex
CREATE INDEX "material_request_items_materialRequestId_idx" ON "material_request_items"("materialRequestId");

-- CreateIndex
CREATE INDEX "material_request_items_materialId_idx" ON "material_request_items"("materialId");

-- CreateIndex
CREATE INDEX "material_request_items_status_idx" ON "material_request_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_code_key" ON "material_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_materials_sinapiCode_key" ON "engineering_materials"("sinapiCode");

-- CreateIndex
CREATE INDEX "engineering_materials_sinapiCode_idx" ON "engineering_materials"("sinapiCode");

-- CreateIndex
CREATE INDEX "engineering_materials_state_idx" ON "engineering_materials"("state");

-- CreateIndex
CREATE INDEX "engineering_materials_categoryId_idx" ON "engineering_materials"("categoryId");

-- CreateIndex
CREATE INDEX "engineering_materials_costCenterId_idx" ON "engineering_materials"("costCenterId");

-- CreateIndex
CREATE INDEX "engineering_materials_isActive_idx" ON "engineering_materials"("isActive");

-- CreateIndex
CREATE INDEX "compositions_sinapiCode_idx" ON "compositions"("sinapiCode");

-- CreateIndex
CREATE INDEX "compositions_state_idx" ON "compositions"("state");

-- CreateIndex
CREATE INDEX "compositions_isActive_idx" ON "compositions"("isActive");

-- CreateIndex
CREATE INDEX "price_history_materialId_idx" ON "price_history"("materialId");

-- CreateIndex
CREATE INDEX "price_history_compositionId_idx" ON "price_history"("compositionId");

-- CreateIndex
CREATE INDEX "price_history_referenceDate_idx" ON "price_history"("referenceDate");

-- CreateIndex
CREATE INDEX "chatgpt_conversations_userId_idx" ON "chatgpt_conversations"("userId");

-- CreateIndex
CREATE INDEX "chatgpt_conversations_createdAt_idx" ON "chatgpt_conversations"("createdAt");

-- CreateIndex
CREATE INDEX "chatgpt_messages_conversationId_idx" ON "chatgpt_messages"("conversationId");

-- CreateIndex
CREATE INDEX "chatgpt_messages_createdAt_idx" ON "chatgpt_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "engineering_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_materials" ADD CONSTRAINT "engineering_materials_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_materials" ADD CONSTRAINT "engineering_materials_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "engineering_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "compositions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatgpt_conversations" ADD CONSTRAINT "chatgpt_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatgpt_messages" ADD CONSTRAINT "chatgpt_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chatgpt_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
