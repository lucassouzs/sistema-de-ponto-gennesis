import type { PrismaClient } from '@prisma/client';

/**
 * Garante tabelas de solicitação de ferramentas (tool rental).
 * Idempotente — cobre ambientes locais onde a migration não foi aplicada.
 */
export async function ensureToolRentalRequestsSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalDemandType" AS ENUM ('NOVA_LOCACAO', 'RENOVACAO', 'DEVOLUCAO', 'COMPRA');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Enum pode existir sem COMPRA em bases antigas
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "ToolRentalDemandType" ADD VALUE 'COMPRA';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalPriority" AS ENUM ('NORMAL', 'URGENT');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalLogisticsMode" AS ENUM (
        'ENTREGA_LOGISTICA',
        'RETIRADA_LOGISTICA',
        'ENTREGA_FORNECEDOR',
        'RETIRADA_FORNECEDOR'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalRequestStatus" AS ENUM (
        'OPEN',
        'SUPPLIER_RELATION',
        'AWAITING_PAYMENT',
        'COMPLETED',
        'REJECTED',
        'CANCELLED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tool_rental_requests" (
      "id" TEXT PRIMARY KEY,
      "code" TEXT NOT NULL UNIQUE,
      "polo" TEXT NOT NULL,
      "contrato" TEXT NOT NULL,
      "obra" TEXT NOT NULL,
      "titulo" TEXT NOT NULL,
      "assignedUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "supplierId" TEXT REFERENCES "suppliers"("id") ON DELETE SET NULL,
      "supplierName" TEXT,
      "priority" "ToolRentalPriority" NOT NULL DEFAULT 'NORMAL',
      "logisticsMode" "ToolRentalLogisticsMode" NOT NULL,
      "demandType" "ToolRentalDemandType" NOT NULL,
      "equipamento" TEXT NOT NULL,
      "periodoInicio" DATE NOT NULL,
      "periodoFim" DATE NOT NULL,
      "linkSugestao" TEXT,
      "status" "ToolRentalRequestStatus" NOT NULL DEFAULT 'OPEN',
      "ocMirrorUrl" TEXT,
      "ocMirrorName" TEXT,
      "paymentProofUrl" TEXT,
      "paymentProofName" TEXT,
      "suppliesApprovedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "suppliesApprovedAt" TIMESTAMP(3),
      "suppliesApprovalComment" TEXT,
      "suppliesRejectionReason" TEXT,
      "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tool_rental_request_events" (
      "id" TEXT PRIMARY KEY,
      "requestId" TEXT NOT NULL REFERENCES "tool_rental_requests"("id") ON DELETE CASCADE,
      "fromStatus" "ToolRentalRequestStatus",
      "toStatus" "ToolRentalRequestStatus" NOT NULL,
      "note" TEXT,
      "actorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_status_idx" ON "tool_rental_requests"("status");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_createdById_idx" ON "tool_rental_requests"("createdById");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_assignedUserId_idx" ON "tool_rental_requests"("assignedUserId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_createdAt_idx" ON "tool_rental_requests"("createdAt");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_request_events_requestId_createdAt_idx" ON "tool_rental_request_events"("requestId", "createdAt");`
  );
}
