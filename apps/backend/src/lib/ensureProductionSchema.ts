import type { PrismaClient } from '@prisma/client';

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
        'suspensa', 'declinada', 'encerrada', 'em_andamento', 'vencidas', 'aguardando_aprovacao'
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

/**
 * Corrige drift conhecido entre Prisma schema e bancos de produção onde migrate deploy não aplicou tudo.
 * DDL idempotente (IF NOT EXISTS / duplicate_object).
 */
export async function ensureProductionSchema(prisma: PrismaClient): Promise<void> {
  try {
    await ensureContractAddendaTable(prisma);
    await ensureMaterialRequestColumns(prisma);
    await ensureMaterialRequestItemColumns(prisma);
    await ensureDemandSheetApprovals(prisma);
    await ensurePurchaseOrderStageApprovals(prisma);
    await ensureFinancialControlAguardarPagamentoStatus(prisma);
    await ensureFinancialControlLancadoStatus(prisma);
    await ensureFinancialControlNfNumberColumn(prisma);
    await ensureDpRequestTypeAdmAsos(prisma);
    await ensureLicitacoesTables(prisma);
    await ensureLicitacaoColumns(prisma);
    await ensureLicitacaoRegiaoAceitesTable(prisma);
    await ensureLicitacaoRegiaoManuaisTable(prisma);
    await ensureLicitacaoRegiaoSheetRowsTable(prisma);
    await ensureBancoCatsServicosTable(prisma);
    await ensureLicitacaoConfigTable(prisma);
    await ensureControleGeralTetoOrcamentarioTable(prisma);
    console.log('[Schema] Verificação de tabelas/colunas críticas concluída.');
  } catch (e) {
    console.error('[Schema] Falha ao garantir esquema de produção:', e);
  }
}
