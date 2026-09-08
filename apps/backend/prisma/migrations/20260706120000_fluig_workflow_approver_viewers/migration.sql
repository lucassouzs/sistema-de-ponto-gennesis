-- CreateTable
CREATE TABLE "fluig_workflow_approver_viewers" (
    "id" TEXT NOT NULL,
    "approverNameKey" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fluig_workflow_approver_viewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fluig_workflow_approver_viewers_approverNameKey_idx" ON "fluig_workflow_approver_viewers"("approverNameKey");

-- CreateIndex
CREATE INDEX "fluig_workflow_approver_viewers_userId_idx" ON "fluig_workflow_approver_viewers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "fluig_workflow_approver_viewers_approverNameKey_userId_key" ON "fluig_workflow_approver_viewers"("approverNameKey", "userId");

-- AddForeignKey
ALTER TABLE "fluig_workflow_approver_viewers" ADD CONSTRAINT "fluig_workflow_approver_viewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluig_workflow_approver_viewers" ADD CONSTRAINT "fluig_workflow_approver_viewers_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
