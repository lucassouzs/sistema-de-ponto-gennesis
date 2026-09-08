import type { PrismaClient } from '@prisma/client';
import { ensureGestaoOsSchema } from './ensureGestaoOsSchema';
import { ensureSupportTicketsSchema } from './ensureSupportTicketsSchema';
import { ensureToolRentalRequestsSchema } from './ensureToolRentalRequestsSchema';

async function columnExists(
  prisma: PrismaClient,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

async function ensureContractAddendaTable(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'contract_addenda')) return;

  console.warn(
    '[Schema] Tabela contract_addenda ausente — criando automaticamente. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy.'
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "contract_addenda" (
      "id" TEXT NOT NULL,
      "contractId" TEXT NOT NULL,
      "effectiveDate" TIMESTAMP(3) NOT NULL,
      "amount" DECIMAL(15, 2) NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "contract_addenda_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "contract_addenda_contractId_idx"
    ON "contract_addenda"("contractId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "contract_addenda_contractId_effectiveDate_idx"
    ON "contract_addenda"("contractId", "effectiveDate");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "contract_addenda" ADD CONSTRAINT "contract_addenda_contractId_fkey"
        FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureMaterialRequestColumns(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'material_requests'))) return;

  if (!(await columnExists(prisma, 'material_requests', 'serviceOrder'))) {
    console.warn('[Schema] Coluna material_requests.serviceOrder ausente — adicionando.');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrder" TEXT;`
    );
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "material_requests_serviceOrder_idx" ON "material_requests"("serviceOrder");
    `);
  }

  if (!(await columnExists(prisma, 'material_requests', 'obra'))) {
    console.warn('[Schema] Coluna material_requests.obra ausente — adicionando.');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "obra" TEXT;`
    );
  }

  if (!(await columnExists(prisma, 'material_requests', 'serviceOrderId'))) {
    console.warn('[Schema] Coluna material_requests.serviceOrderId ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrderId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "material_requests_serviceOrderId_idx" ON "material_requests"("serviceOrderId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_serviceOrderId_fkey"
          FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  if (!(await columnExists(prisma, 'material_requests', 'demandSheet'))) {
    console.warn('[Schema] Colunas de ficha de demanda em material_requests ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_requests"
        ADD COLUMN IF NOT EXISTS "demandSheet" TEXT,
        ADD COLUMN IF NOT EXISTS "demandSheetAttachmentUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "demandSheetAttachmentName" TEXT;
    `);
  }

  if (!(await columnExists(prisma, 'material_requests', 'demandSheetAttachments'))) {
    console.warn('[Schema] Coluna demandSheetAttachments em material_requests ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_requests"
        ADD COLUMN IF NOT EXISTS "demandSheetAttachments" JSONB;
    `);
  }
}

async function ensureMaterialRequestItemColumns(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'material_request_items'))) return;

  if (!(await columnExists(prisma, 'material_request_items', 'attachmentUrl'))) {
    console.warn('[Schema] Colunas de anexo em material_request_items ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_request_items"
        ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
    `);
  }

  if (!(await columnExists(prisma, 'material_request_items', 'bankDetails'))) {
    console.warn('[Schema] Coluna bankDetails em material_request_items ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_request_items"
        ADD COLUMN IF NOT EXISTS "bankDetails" TEXT;
    `);
  }
}

async function ensureMaterialRequestCommentsTable(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'material_request_comments')) return;
  console.warn('[Schema] Tabela material_request_comments ausente — criando.');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "material_request_comments" (
      "id" TEXT NOT NULL,
      "materialRequestId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "material_request_comments_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "material_request_comments_materialRequestId_idx"
      ON "material_request_comments"("materialRequestId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "material_request_comments_userId_idx"
      ON "material_request_comments"("userId");
  `);
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_request_comments"
        ADD CONSTRAINT "material_request_comments_materialRequestId_fkey"
        FOREIGN KEY ("materialRequestId") REFERENCES "material_requests"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* constraint already exists */
  }
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_request_comments"
        ADD CONSTRAINT "material_request_comments_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* constraint already exists */
  }
}

async function ensurePurchaseOrderCommentsTable(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'purchase_order_comments')) return;
  console.warn('[Schema] Tabela purchase_order_comments ausente — criando.');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchase_order_comments" (
      "id" TEXT NOT NULL,
      "purchaseOrderId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchase_order_comments_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_order_comments_purchaseOrderId_idx"
      ON "purchase_order_comments"("purchaseOrderId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_order_comments_userId_idx"
      ON "purchase_order_comments"("userId");
  `);
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_order_comments"
        ADD CONSTRAINT "purchase_order_comments_purchaseOrderId_fkey"
        FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* constraint already exists */
  }
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_order_comments"
        ADD CONSTRAINT "purchase_order_comments_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* constraint already exists */
  }
}

async function ensureDemandSheetApprovals(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'demand_sheet_approvals'))) {
    console.warn('[Schema] Tabela demand_sheet_approvals ausente — criando.');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        CREATE TYPE "DemandSheetApprovalStatus" AS ENUM ('WAITING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "demand_sheet_approvals" (
        "id" TEXT NOT NULL,
        "numMovRm" TEXT NOT NULL,
        "idMovRm" TEXT NOT NULL,
        "codigoPedido" TEXT NOT NULL,
        "solicitanteId" TEXT NOT NULL,
        "contratoId" TEXT NOT NULL,
        "obra" TEXT NOT NULL,
        "codFichaDemanda" TEXT NOT NULL,
        "faturamentoEstimado" DECIMAL(15,2) NOT NULL,
        "custoEstimado" DECIMAL(15,2) NOT NULL,
        "observacao" TEXT NOT NULL,
        "dataHora" TIMESTAMP(3) NOT NULL,
        "polo" TEXT NOT NULL,
        "anexos" JSONB NOT NULL DEFAULT '[]',
        "status" "DemandSheetApprovalStatus" NOT NULL DEFAULT 'WAITING_MANAGER',
        "createdBy" TEXT NOT NULL,
        "managerApprovedBy" TEXT,
        "managerApprovedAt" TIMESTAMP(3),
        "managerApprovalComment" TEXT,
        "managerRejectionReason" TEXT,
        "managerRejectionComment" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "demand_sheet_approvals_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_contratoId_idx" ON "demand_sheet_approvals"("contratoId");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_solicitanteId_idx" ON "demand_sheet_approvals"("solicitanteId");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_createdBy_idx" ON "demand_sheet_approvals"("createdBy");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_status_idx" ON "demand_sheet_approvals"("status");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_codFichaDemanda_idx" ON "demand_sheet_approvals"("codFichaDemanda");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_solicitanteId_fkey"
          FOREIGN KEY ("solicitanteId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_contratoId_fkey"
          FOREIGN KEY ("contratoId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_createdBy_fkey"
          FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_managerApprovedBy_fkey"
          FOREIGN KEY ("managerApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  if (!(await columnExists(prisma, 'demand_sheet_approvals', 'purchaseStatus'))) {
    console.warn('[Schema] Colunas de status de compras em demand_sheet_approvals ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        CREATE TYPE "DemandSheetPurchaseStatus" AS ENUM (
          'WAREHOUSE_DF',
          'WAREHOUSE_GO',
          'FULLY_FULFILLED_BY_STOCK',
          'PARTIALLY_FULFILLED_BY_STOCK',
          'PURCHASE_REQUEST',
          'SUPPLIES',
          'FINISHED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "demand_sheet_approvals"
        ADD COLUMN IF NOT EXISTS "purchaseStatus" "DemandSheetPurchaseStatus",
        ADD COLUMN IF NOT EXISTS "purchaseStatusUpdatedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "purchaseStatusUpdatedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_purchaseStatus_idx"
      ON "demand_sheet_approvals"("purchaseStatus");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_purchaseStatusUpdatedBy_fkey"
          FOREIGN KEY ("purchaseStatusUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}

async function ensurePurchaseOrderStageApprovals(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'purchase_orders'))) return;

  if (!(await columnExists(prisma, 'purchase_orders', 'comprasApprovedBy'))) {
    console.warn('[Schema] Colunas de aprovação por etapa em purchase_orders ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_orders"
        ADD COLUMN IF NOT EXISTS "comprasApprovedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "comprasApprovedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "gestorApprovedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "gestorApprovedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_comprasApprovedBy_fkey"
          FOREIGN KEY ("comprasApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_gestorApprovedBy_fkey"
          FOREIGN KEY ("gestorApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}

async function ensureFinancialControlAguardarPagamentoStatus(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      INNER JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'FinancialControlStatus'
        AND e.enumlabel = 'AGUARDAR_PAGAMENTO'
    ) AS "exists"
  `;
  if (rows[0]?.exists) return;

  console.warn(
    '[Schema] Enum FinancialControlStatus sem AGUARDAR_PAGAMENTO — adicionando. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy.',
  );
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TYPE "FinancialControlStatus" ADD VALUE 'AGUARDAR_PAGAMENTO';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureFinancialControlLancadoStatus(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      INNER JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'FinancialControlStatus'
        AND e.enumlabel = 'LANCADO'
    ) AS "exists"
  `;
  if (rows[0]?.exists) return;

  console.warn(
    '[Schema] Enum FinancialControlStatus sem LANCADO — adicionando. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy.',
  );
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TYPE "FinancialControlStatus" ADD VALUE 'LANCADO';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureFinancialControlAttachmentsColumn(prisma: PrismaClient): Promise<void> {
  if (!(await columnExists(prisma, 'financial_control_entries', 'attachments'))) {
    console.warn('[Schema] Coluna attachments em financial_control_entries ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "financial_control_entries"
        ADD COLUMN IF NOT EXISTS "attachments" JSONB;
    `);
  }
}

async function ensureFinancialControlApplicationTypeColumn(prisma: PrismaClient): Promise<void> {
  if (!(await columnExists(prisma, 'financial_control_entries', 'applicationType'))) {
    console.warn('[Schema] Coluna applicationType em financial_control_entries ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "financial_control_entries"
        ADD COLUMN IF NOT EXISTS "applicationType" TEXT;
    `);
  }
}

async function ensureFinancialControlNfNumberColumn(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "financial_control_entries" ADD COLUMN IF NOT EXISTS "nfNumber" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "financial_control_entries"
    SET
      "nfNumber" = substring("parcelNumber" from '^(\\d+)-\\d+/\\d+$'),
      "parcelNumber" = substring("parcelNumber" from '^\\d+-(\\d+/\\d+)$')
    WHERE "nfNumber" IS NULL
      AND "parcelNumber" IS NOT NULL
      AND "parcelNumber" ~ '^\\d+-\\d+/\\d+$';
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "financial_control_entries"
    SET
      "nfNumber" = substring("parcelNumber" from '^(\\d+)-\\d{1,3}$'),
      "parcelNumber" = substring("parcelNumber" from '^\\d+-(\\d{1,3})$')
    WHERE "nfNumber" IS NULL
      AND "parcelNumber" IS NOT NULL
      AND "parcelNumber" ~ '^\\d+-\\d{1,3}$';
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "financial_control_entries"
    SET
      "nfNumber" = "parcelNumber",
      "parcelNumber" = NULL
    WHERE "nfNumber" IS NULL
      AND "parcelNumber" IS NOT NULL
      AND "parcelNumber" !~ '^\\d+/\\d+$';
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "financial_control_entries"
    SET
      "nfNumber" = "nfNumber" || '-' || "parcelNumber",
      "parcelNumber" = NULL
    WHERE "nfNumber" IS NOT NULL
      AND "parcelNumber" IS NOT NULL
      AND "nfNumber" !~ '^\\d+$'
      AND "parcelNumber" ~ '^\\d+$'
      AND "parcelNumber" !~ '/';
  `);
}

async function ensureDpRequestTypeAdmAsos(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      INNER JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'DpRequestType'
        AND e.enumlabel = 'ADM_ASOS'
    ) AS "exists"
  `;
  if (rows[0]?.exists) return;

  console.warn(
    '[Schema] Enum DpRequestType sem ADM_ASOS — adicionando. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy.',
  );
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TYPE "DpRequestType" ADD VALUE 'ADM_ASOS';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensurePurchaseOrderAttachmentsColumn(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'purchase_orders'))) return;
  if (!(await columnExists(prisma, 'purchase_orders', 'attachments'))) {
    console.warn('[Schema] Coluna attachments em purchase_orders ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_orders"
        ADD COLUMN IF NOT EXISTS "attachments" JSONB;
    `);
  }
}

async function ensurePurchaseOrderPixFields(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'purchase_orders'))) return;

  if (!(await columnExists(prisma, 'purchase_orders', 'pixKeyType'))) {
    console.warn('[Schema] Colunas PIX em purchase_orders ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_orders"
        ADD COLUMN IF NOT EXISTS "pixKeyType" TEXT,
        ADD COLUMN IF NOT EXISTS "pixKey" TEXT;
    `);
  }
}

async function ensureLicitacoesTables(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'licitacoes')) return;

  console.warn(
    '[Schema] Tabelas de licitações ausentes — criando automaticamente. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy && npx prisma generate'
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacoes" (
      "id" TEXT NOT NULL,
      "titulo" TEXT NOT NULL,
      "numeroProcesso" TEXT,
      "orgao" TEXT,
      "modalidade" TEXT,
      "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
      "objeto" TEXT,
      "valorEstimado" TEXT,
      "estado" TEXT,
      "regiaoKey" TEXT,
      "vigenciaContrato" TEXT,
      "analiseJson" JSONB,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "licitacoes_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_documentos" (
      "id" TEXT NOT NULL,
      "licitacaoId" TEXT NOT NULL,
      "originalName" TEXT NOT NULL,
      "storagePath" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_documentos_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacoes_createdBy_idx" ON "licitacoes"("createdBy");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacoes_status_idx" ON "licitacoes"("status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacoes_createdAt_idx" ON "licitacoes"("createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_documentos_licitacaoId_idx"
    ON "licitacao_documentos"("licitacaoId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacao_documentos" ADD CONSTRAINT "licitacao_documentos_licitacaoId_fkey"
        FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureLicitacaoRegiaoRejeitesTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_regiao_rejeites" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "rowSnapshot" JSONB,
      "rejectedBy" TEXT NOT NULL,
      "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_rejeites_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_rejeites_regiao_sheet_row_key"
    ON "licitacao_regiao_rejeites"("regiaoKey", "spreadsheetId", "rowKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_regiao_rejeites_regiaoKey_idx"
    ON "licitacao_regiao_rejeites"("regiaoKey");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_rejeites" ADD CONSTRAINT "licitacao_regiao_rejeites_rejectedBy_fkey"
        FOREIGN KEY ("rejectedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureLicitacaoRegiaoAceitesTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_regiao_aceites" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "rowSnapshot" JSONB,
      "acceptedBy" TEXT NOT NULL,
      "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_aceites_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_aceites_regiao_sheet_row_key"
    ON "licitacao_regiao_aceites"("regiaoKey", "spreadsheetId", "rowKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_regiao_aceites_regiaoKey_idx"
    ON "licitacao_regiao_aceites"("regiaoKey");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_aceites" ADD CONSTRAINT "licitacao_regiao_aceites_acceptedBy_fkey"
        FOREIGN KEY ("acceptedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacao_regiao_aceites"
    ADD COLUMN IF NOT EXISTS "licitacaoId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacao_regiao_aceites"
    ADD COLUMN IF NOT EXISTS "processoExcluido" BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_regiao_aceites_licitacaoId_idx"
    ON "licitacao_regiao_aceites"("licitacaoId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_aceites" ADD CONSTRAINT "licitacao_regiao_aceites_licitacaoId_fkey"
        FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureLicitacaoRegiaoSheetRowsTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_regiao_sheet_rows" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "headers" JSONB NOT NULL,
      "rowSnapshot" JSONB NOT NULL,
      "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_sheet_rows_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_sheet_rows_regiao_sheet_row_key"
    ON "licitacao_regiao_sheet_rows"("regiaoKey", "spreadsheetId", "rowKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_regiao_sheet_rows_regiaoKey_idx"
    ON "licitacao_regiao_sheet_rows"("regiaoKey");
  `);
}

async function ensureLicitacaoRegiaoManuaisTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_regiao_manuais" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "headers" JSONB NOT NULL,
      "rowSnapshot" JSONB NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_manuais_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_manuais_regiao_row_key"
    ON "licitacao_regiao_manuais"("regiaoKey", "rowKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_regiao_manuais_regiaoKey_idx"
    ON "licitacao_regiao_manuais"("regiaoKey");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_manuais" ADD CONSTRAINT "licitacao_regiao_manuais_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensurePncpEnviadosAnaliseTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pncp_enviados_analise" (
      "id" TEXT NOT NULL,
      "numeroControlePNCP" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "enviadoBy" TEXT NOT NULL,
      "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_enviados_analise_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "pncp_enviados_analise_numero_key"
    ON "pncp_enviados_analise"("numeroControlePNCP");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_enviados_analise_regiaoKey_idx"
    ON "pncp_enviados_analise"("regiaoKey");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "pncp_enviados_analise" ADD CONSTRAINT "pncp_enviados_analise_enviadoBy_fkey"
        FOREIGN KEY ("enviadoBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensurePncpRejeitadosTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pncp_rejeitados" (
      "id" TEXT NOT NULL,
      "numeroControlePNCP" TEXT NOT NULL,
      "rejeitadoBy" TEXT NOT NULL,
      "rejeitadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_rejeitados_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "pncp_rejeitados_numero_key"
    ON "pncp_rejeitados"("numeroControlePNCP");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "pncp_rejeitados" ADD CONSTRAINT "pncp_rejeitados_rejeitadoBy_fkey"
        FOREIGN KEY ("rejeitadoBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensurePncpKeywordsCustomTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pncp_keywords_custom" (
      "keyword" TEXT NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_keywords_custom_pkey" PRIMARY KEY ("keyword")
    );
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "pncp_keywords_custom" ADD CONSTRAINT "pncp_keywords_custom_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensurePncpNumeroCompraColumn(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "pncp_contratacoes"
      ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
  `);
}

async function ensureBancoCatsServicosTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "banco_cats_servicos" (
      "id" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "headers" JSONB NOT NULL,
      "rowSnapshot" JSONB NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "banco_cats_servicos_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "banco_cats_servicos_sheet_row_key"
    ON "banco_cats_servicos"("spreadsheetId", "rowKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "banco_cats_servicos_spreadsheetId_idx"
    ON "banco_cats_servicos"("spreadsheetId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "banco_cats_servicos" ADD CONSTRAINT "banco_cats_servicos_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureLicitacaoColumns(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'licitacoes'))) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "estado" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "regiaoKey" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivada" BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivadaEm" TIMESTAMP(3);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivadaMotivo" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacoes_arquivada_idx"
    ON "licitacoes"("arquivada");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacoes_arquivada_motivo_idx"
    ON "licitacoes"("arquivadaMotivo");
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "licitacoes"
    SET "arquivadaMotivo" = "analiseJson"->>'arquivadaMotivo'
    WHERE COALESCE("arquivada", FALSE) = TRUE
      AND "arquivadaMotivo" IS NULL
      AND ("analiseJson"->>'arquivadaMotivo') IN (
        'suspensa', 'declinada', 'encerrada', 'em_andamento', 'vencidas', 'aguardando_aprovacao', 'orcamento'
      );
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "licitacoes"
    SET "arquivadaMotivo" = NULL
    WHERE COALESCE("arquivada", FALSE) = TRUE
      AND "arquivadaMotivo" = 'encerrada'
      AND COALESCE("analiseJson"->>'arquivadaMotivo', '') = '';
  `);
}

async function ensureLicitacaoConfigTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_config" (
      "key" TEXT NOT NULL,
      "value" JSONB NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_config_pkey" PRIMARY KEY ("key")
    );
  `);
}

async function ensureLicitacaoOrcamentosTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "licitacao_orcamentos" (
      "id" TEXT NOT NULL,
      "licitacaoId" TEXT NOT NULL,
      "inputsJson" JSONB NOT NULL,
      "resultJson" JSONB NOT NULL,
      "createdBy" TEXT,
      "updatedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_orcamentos_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_orcamentos_licitacaoId_key"
    ON "licitacao_orcamentos"("licitacaoId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "licitacao_orcamentos_updatedAt_idx"
    ON "licitacao_orcamentos"("updatedAt");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "licitacao_orcamentos"
      ADD CONSTRAINT "licitacao_orcamentos_licitacaoId_fkey"
      FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensurePncpTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pncp_contratacoes" (
      "id" TEXT NOT NULL,
      "numeroControlePNCP" TEXT NOT NULL,
      "sequencialCompra" INTEGER,
      "processo" TEXT,
      "objeto" TEXT,
      "objetoNorm" TEXT,
      "orgao" TEXT,
      "cnpjOrgao" TEXT,
      "unidadeCompradora" TEXT,
      "codigoUnidadeCompradora" TEXT,
      "uf" TEXT NOT NULL,
      "municipio" TEXT,
      "modalidade" TEXT,
      "codigoModalidade" INTEGER NOT NULL,
      "situacao" TEXT,
      "modoDisputa" TEXT,
      "plataforma" TEXT,
      "srp" BOOLEAN,
      "valorEstimado" DOUBLE PRECISION,
      "valorHomologado" DOUBLE PRECISION,
      "dataInclusao" TIMESTAMP(3),
      "dataAberturaProposta" TIMESTAMP(3),
      "dataEncerramentoProposta" TIMESTAMP(3),
      "amparoLegal" TEXT,
      "linkSistemaOrigem" TEXT,
      "linkPncp" TEXT,
      "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_contratacoes_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "pncp_contratacoes_numeroControlePNCP_key"
    ON "pncp_contratacoes"("numeroControlePNCP");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_contratacoes_uf_idx"
    ON "pncp_contratacoes"("uf");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_contratacoes_codigoModalidade_idx"
    ON "pncp_contratacoes"("codigoModalidade");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_contratacoes_dataInclusao_idx"
    ON "pncp_contratacoes"("dataInclusao");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_contratacoes_uf_codigoModalidade_dataInclusao_idx"
    ON "pncp_contratacoes"("uf", "codigoModalidade", "dataInclusao");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_contratacoes_syncedAt_idx"
    ON "pncp_contratacoes"("syncedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pncp_sync_runs" (
      "id" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "trigger" TEXT NOT NULL,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" TIMESTAMP(3),
      "lookbackDays" INTEGER NOT NULL,
      "pagesFetched" INTEGER NOT NULL DEFAULT 0,
      "upserted" INTEGER NOT NULL DEFAULT 0,
      "pruned" INTEGER NOT NULL DEFAULT 0,
      "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_sync_runs_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_sync_runs_startedAt_idx"
    ON "pncp_sync_runs"("startedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_sync_runs_status_idx"
    ON "pncp_sync_runs"("status");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pncp_sync_uf_states" (
      "uf" TEXT NOT NULL,
      "lastSuccessAt" TIMESTAMP(3),
      "lastAttemptAt" TIMESTAMP(3),
      "lastDataFinal" TEXT,
      "lastStatus" TEXT NOT NULL DEFAULT 'pending',
      "lastErrorMessage" TEXT,
      "lastRunId" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_sync_uf_states_pkey" PRIMARY KEY ("uf")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_sync_uf_states_lastStatus_idx"
    ON "pncp_sync_uf_states"("lastStatus");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pncp_sync_uf_states_lastSuccessAt_idx"
    ON "pncp_sync_uf_states"("lastSuccessAt");
  `);
}

async function ensureControleGeralTetoOrcamentarioTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "controle_geral_teto_orcamentario" (
      "id" TEXT NOT NULL,
      "contractKey" TEXT NOT NULL,
      "contractName" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "amount" DECIMAL(15,2) NOT NULL,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "controle_geral_teto_orcamentario_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "controle_geral_teto_orcamentario_contractKey_year_month_key"
    ON "controle_geral_teto_orcamentario"("contractKey", "year", "month");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "controle_geral_teto_orcamentario_contractKey_idx"
    ON "controle_geral_teto_orcamentario"("contractKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "controle_geral_teto_orcamentario_year_month_idx"
    ON "controle_geral_teto_orcamentario"("year", "month");
  `);
}

async function ensureAuditLogTracking(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'audit_logs'))) {
    console.warn('[Schema] Tabela audit_logs ausente — criando automaticamente.');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "action" TEXT NOT NULL,
        "entity" TEXT NOT NULL,
        "entityId" TEXT,
        "summary" TEXT,
        "oldData" JSONB,
        "newData" JSONB,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
      );
    `);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "summary" TEXT;`
  );
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx"
    ON "audit_logs"("userId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "audit_logs_entity_createdAt_idx"
    ON "audit_logs"("entity", "createdAt");
  `);
}

async function ensureUserActivityTracking(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'users')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActivityPath" TEXT;`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActivityLabel" TEXT;`
    );
  }

  if (!(await tableExists(prisma, 'user_login_events'))) {
    console.warn('[Schema] Tabela user_login_events ausente — criando automaticamente.');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "user_login_events" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'login',
        "success" BOOLEAN NOT NULL DEFAULT true,
        "source" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_login_events_pkey" PRIMARY KEY ("id")
      );
    `);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "user_login_events" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'login';`
  );

  if (!(await tableExists(prisma, 'user_page_visits'))) {
    console.warn('[Schema] Tabela user_page_visits ausente — criando automaticamente.');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "user_page_visits" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "path" TEXT NOT NULL,
        "label" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_page_visits_pkey" PRIMARY KEY ("id")
      );
    `);
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_login_events_userId_createdAt_idx"
    ON "user_login_events"("userId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_page_visits_userId_createdAt_idx"
    ON "user_page_visits"("userId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_page_visits_userId_path_createdAt_idx"
    ON "user_page_visits"("userId", "path", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "user_login_events" ADD CONSTRAINT "user_login_events_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "user_page_visits" ADD CONSTRAINT "user_page_visits_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureDriveStarTrashColumns(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "drive_folders_ownerId_trashedAt_idx" ON "drive_folders"("ownerId", "trashedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "drive_folders_starred_idx" ON "drive_folders"("starred");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "drive_files_ownerId_trashedAt_idx" ON "drive_files"("ownerId", "trashedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "drive_files_starred_idx" ON "drive_files"("starred");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "drive_files_updatedAt_idx" ON "drive_files"("updatedAt");
  `);
}

async function ensureQuoteMapUnitPricePrecision(prisma: PrismaClient): Promise<void> {
  // Preço unitário da cotação / OC com até 5 casas (ex.: 0,03230).
  if (await tableExists(prisma, 'quote_map_supplier_items')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "quote_map_supplier_items"
      ALTER COLUMN "unitPrice" TYPE DECIMAL(12, 5);
    `);
  }
  if (await tableExists(prisma, 'quote_map_winner_items')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "quote_map_winner_items"
      ALTER COLUMN "winnerUnitPrice" TYPE DECIMAL(12, 5);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "quote_map_winner_items"
      ALTER COLUMN "winnerScore" TYPE DECIMAL(15, 5);
    `);
  }
  if (await tableExists(prisma, 'purchase_order_items')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_order_items"
      ALTER COLUMN "unitPrice" TYPE DECIMAL(12, 5);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_order_items"
      ALTER COLUMN "totalPrice" TYPE DECIMAL(14, 5);
    `);
  }
}

async function ensureJuridicoProcessosTables(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'juridico_processos')) return;

  console.warn(
    '[Schema] Tabelas de processos jurídicos ausentes — criando automaticamente. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy.',
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "juridico_processos" (
      "id" TEXT NOT NULL,
      "externalId" TEXT NOT NULL,
      "numeroProcesso" TEXT NOT NULL,
      "tribunal" TEXT,
      "vara" TEXT,
      "reclamante" TEXT NOT NULL,
      "dataAudiencia" TEXT,
      "horario" TEXT,
      "presencial" TEXT,
      "statusProcesso" TEXT,
      "decisaoStf" TEXT,
      "polo" TEXT,
      "empresa" TEXT,
      "objeto" TEXT,
      "objeto2" TEXT,
      "contrato" TEXT,
      "funcao" TEXT,
      "regimeContratacao" TEXT,
      "periodo" TEXT,
      "periodoInicio" TEXT,
      "periodoFim" TEXT,
      "representanteAutor" TEXT,
      "acordo" TEXT,
      "valorCausa" DECIMAL(14, 2),
      "statusSentenca" TEXT,
      "valorSentenca" DECIMAL(14, 2),
      "valorRO" DECIMAL(14, 2),
      "valorRR" DECIMAL(14, 2),
      "valorCustas" DECIMAL(14, 2),
      "valorAcordo" DECIMAL(14, 2),
      "valorPagoSentenciado" DECIMAL(14, 2),
      "valorParcela" DECIMAL(14, 2),
      "valorPago" DECIMAL(14, 2),
      "numParcelas" INTEGER,
      "custas" DECIMAL(14, 2),
      "previdencia" DECIMAL(14, 2),
      "outrosGastos" DECIMAL(14, 2),
      "status" TEXT,
      "dataAcordo" TEXT,
      "dataAbertura" TEXT,
      "agravoInstrumento" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "juridico_processos_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "juridico_processos_externalId_key"
      ON "juridico_processos"("externalId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "juridico_processo_anexos" (
      "id" TEXT NOT NULL,
      "processoId" TEXT NOT NULL,
      "externalId" TEXT,
      "originalName" TEXT NOT NULL,
      "sourcePath" TEXT,
      "fileUrl" TEXT,
      "fileKey" TEXT,
      "mimeType" TEXT,
      "size" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "juridico_processo_anexos_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "juridico_processo_comprovantes" (
      "id" TEXT NOT NULL,
      "processoId" TEXT NOT NULL,
      "externalId" TEXT,
      "originalName" TEXT NOT NULL,
      "sourcePath" TEXT,
      "dataPagamento" TEXT,
      "fileUrl" TEXT,
      "fileKey" TEXT,
      "mimeType" TEXT,
      "size" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "juridico_processo_comprovantes_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "juridico_processo_anexos"
        ADD CONSTRAINT "juridico_processo_anexos_processoId_fkey"
        FOREIGN KEY ("processoId") REFERENCES "juridico_processos"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "juridico_processo_comprovantes"
        ADD CONSTRAINT "juridico_processo_comprovantes_processoId_fkey"
        FOREIGN KEY ("processoId") REFERENCES "juridico_processos"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

/**
 * Corrige drift conhecido entre Prisma schema e bancos de produção onde migrate deploy não aplicou tudo.
 * DDL idempotente (IF NOT EXISTS / duplicate_object).
 */
async function ensureUnaccentExtension(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  } catch (e) {
    console.warn(
      '[Schema] Não foi possível criar a extensão unaccent (busca sem acento pode falhar):',
      e instanceof Error ? e.message : e
    );
  }
}

export async function ensureProductionSchema(prisma: PrismaClient): Promise<void> {
  try {
    await ensureUnaccentExtension(prisma);
    await ensureContractAddendaTable(prisma);
    await ensureMaterialRequestColumns(prisma);
    await ensureMaterialRequestItemColumns(prisma);
    await ensureMaterialRequestCommentsTable(prisma);
    await ensurePurchaseOrderCommentsTable(prisma);
    await ensureDemandSheetApprovals(prisma);
    await ensurePurchaseOrderStageApprovals(prisma);
    await ensurePurchaseOrderAttachmentsColumn(prisma);
    await ensureFinancialControlAguardarPagamentoStatus(prisma);
    await ensureFinancialControlLancadoStatus(prisma);
    await ensureFinancialControlNfNumberColumn(prisma);
    await ensureFinancialControlAttachmentsColumn(prisma);
    await ensureFinancialControlApplicationTypeColumn(prisma);
    await ensureDpRequestTypeAdmAsos(prisma);
    await ensureLicitacoesTables(prisma);
    await ensureLicitacaoColumns(prisma);
    await ensureLicitacaoRegiaoAceitesTable(prisma);
    await ensureLicitacaoRegiaoRejeitesTable(prisma);
    await ensureLicitacaoRegiaoManuaisTable(prisma);
    await ensurePncpEnviadosAnaliseTable(prisma);
    await ensurePncpRejeitadosTable(prisma);
    await ensurePncpKeywordsCustomTable(prisma);
    await ensurePncpNumeroCompraColumn(prisma);
    await ensureLicitacaoRegiaoSheetRowsTable(prisma);
    await ensureBancoCatsServicosTable(prisma);
    await ensureLicitacaoConfigTable(prisma);
    await ensureLicitacaoOrcamentosTable(prisma);
    await ensurePncpTables(prisma);
    await ensureControleGeralTetoOrcamentarioTable(prisma);
    await ensureDriveStarTrashColumns(prisma);
    await ensureUserActivityTracking(prisma);
    await ensureAuditLogTracking(prisma);
    await ensureQuoteMapUnitPricePrecision(prisma);
    await ensureToolRentalRequestsSchema(prisma);
    await ensureGestaoOsSchema(prisma);
    await ensureSupportTicketsSchema(prisma);
    await ensureJuridicoProcessosTables(prisma);
    console.log('[Schema] Verificação de tabelas/colunas críticas concluída.');
  } catch (e) {
    console.error('[Schema] Falha ao garantir esquema de produção:', e);
  }
}
