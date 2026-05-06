-- Base da tabela dp_requests e enums (migrations seguintes só fazem ALTER).
-- Necessário em produção: migrations 2026041614+ assumiam a tabela já existente.

CREATE TYPE "DpRequestUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TYPE "DpRequestStatus" AS ENUM (
  'WAITING_MANAGER',
  'IN_REVIEW_DP',
  'WAITING_RETURN',
  'CONCLUDED',
  'CANCELLED'
);

CREATE TYPE "DpRequestType" AS ENUM ('FERIAS', 'RESCISAO', 'ATESTADO_MEDICO', 'OUTRAS_SOLICITACOES');

CREATE TABLE "dp_requests" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "urgency" "DpRequestUrgency" NOT NULL DEFAULT 'MEDIUM',
  "requestType" "DpRequestType" NOT NULL,
  "title" TEXT NOT NULL,
  "sectorSolicitante" TEXT NOT NULL,
  "solicitanteNome" TEXT NOT NULL,
  "solicitanteEmail" TEXT NOT NULL,
  "prazoInicio" TIMESTAMP(3) NOT NULL,
  "prazoFim" TIMESTAMP(3) NOT NULL,
  "contractId" TEXT,
  "company" TEXT,
  "polo" TEXT,
  "status" "DpRequestStatus" NOT NULL DEFAULT 'WAITING_MANAGER',
  "managerApprovedBy" TEXT,
  "managerApprovedAt" TIMESTAMP(3),
  "managerApprovalComment" TEXT,
  "managerRejectionReason" TEXT,
  "managerRejectionComment" TEXT,
  "dpFeedback" TEXT,
  "dpFeedbackAt" TIMESTAMP(3),
  "requesterReturnComment" TEXT,
  "requesterReturnedAt" TIMESTAMP(3),
  "dpConclusionComment" TEXT,
  "dpConcludedAt" TIMESTAMP(3),
  "dpHandledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dp_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dp_requests_employeeId_idx" ON "dp_requests"("employeeId");
CREATE INDEX "dp_requests_status_idx" ON "dp_requests"("status");

ALTER TABLE "dp_requests"
  ADD CONSTRAINT "dp_requests_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dp_requests"
  ADD CONSTRAINT "dp_requests_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
