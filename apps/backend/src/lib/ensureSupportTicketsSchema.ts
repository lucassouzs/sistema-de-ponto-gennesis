import type { PrismaClient } from '@prisma/client';

/** Garante tabela de tickets de suporte ao sistema (senha, erro, permissão). */
export async function ensureSupportTicketsSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "SupportTicketCategory" AS ENUM (
        'PASSWORD_RESET', 'SYSTEM_ERROR', 'PERMISSION', 'OTHER'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "SupportTicketStatus" AS ENUM (
        'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "SupportTicketChannel" AS ENUM (
        'GENNECY_CHAT', 'WHATSAPP', 'WEB'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "support_tickets" (
      "id" TEXT PRIMARY KEY,
      "displayNumber" INTEGER NOT NULL UNIQUE,
      "category" "SupportTicketCategory" NOT NULL,
      "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
      "channel" "SupportTicketChannel" NOT NULL,
      "subject" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "moduleHint" TEXT,
      "requesterId" TEXT,
      "requesterName" TEXT,
      "requesterPhone" TEXT,
      "requesterCpf" TEXT,
      "assigneeId" TEXT,
      "whatsAppConversationId" TEXT,
      "sourceChatId" TEXT,
      "attachmentUrl" TEXT,
      "resolutionNote" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "closedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" ("status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "support_tickets_category_idx" ON "support_tickets" ("category");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "support_tickets_requesterId_idx" ON "support_tickets" ("requesterId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "support_tickets_assigneeId_idx" ON "support_tickets" ("assigneeId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "support_tickets_createdAt_idx" ON "support_tickets" ("createdAt");
  `);
}
