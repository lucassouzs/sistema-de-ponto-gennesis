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

/**
 * Garante tabelas de Gestão de OS (manutenção predial + cadastros).
 * Idempotente — seguro em bootstrap de produção/dev.
 */
export async function ensureGestaoOsSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "GestaoOsPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "GestaoOsMaintenanceType" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'PREDICTIVE');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "GestaoOsStatus" AS ENUM (
        'OPEN', 'UNDER_REVIEW', 'APPROVED', 'SAFETY_CHECK', 'IN_PROGRESS',
        'WAITING_PARTS', 'COMPLETED', 'REWORK', 'CLOSED', 'CANCELLED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "GestaoOsStatus" ADD VALUE IF NOT EXISTS 'SAFETY_CHECK'`
    );
  } catch {
    /* valor já existe ou o tipo acabou de ser criado com SAFETY_CHECK */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "GestaoOsStatus" ADD VALUE IF NOT EXISTS 'REWORK'`
    );
  } catch {
    /* valor já existe ou o tipo acabou de ser criado com REWORK */
  }
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "GestaoOsProfile" AS ENUM ('REQUESTER', 'MANAGER', 'TECHNICIAN', 'ADMIN');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_settings" (
      "id" TEXT PRIMARY KEY DEFAULT 'default',
      "nextOsNumber" INTEGER NOT NULL DEFAULT 1,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "gestao_os_settings" ("id", "nextOsNumber", "updatedAt")
    VALUES ('default', 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_companies" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "tradeName" TEXT,
      "document" TEXT,
      "code" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_branches" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL REFERENCES "gestao_os_companies"("id") ON DELETE CASCADE,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "address" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_providers" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL,
      "name" TEXT NOT NULL,
      "document" TEXT,
      "specialty" TEXT,
      "contactName" TEXT,
      "phone" TEXT,
      "email" TEXT,
      "notes" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_service_categories" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "description" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_memberships" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL REFERENCES "gestao_os_companies"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "profile" "GestaoOsProfile" NOT NULL DEFAULT 'REQUESTER',
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_buildings" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL,
      "branchId" TEXT REFERENCES "gestao_os_branches"("id") ON DELETE SET NULL,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!(await columnExists(prisma, 'gestao_os_buildings', 'companyId'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "gestao_os_buildings" ADD COLUMN "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL;`
    );
  }
  if (!(await columnExists(prisma, 'gestao_os_buildings', 'branchId'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "gestao_os_buildings" ADD COLUMN "branchId" TEXT REFERENCES "gestao_os_branches"("id") ON DELETE SET NULL;`
    );
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_sectors" (
      "id" TEXT PRIMARY KEY,
      "buildingId" TEXT NOT NULL REFERENCES "gestao_os_buildings"("id") ON DELETE CASCADE,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_places" (
      "id" TEXT PRIMARY KEY,
      "sectorId" TEXT NOT NULL REFERENCES "gestao_os_sectors"("id") ON DELETE CASCADE,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_assets" (
      "id" TEXT PRIMARY KEY,
      "placeId" TEXT NOT NULL REFERENCES "gestao_os_places"("id") ON DELETE CASCADE,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "category" TEXT,
      "qrToken" TEXT NOT NULL UNIQUE,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!(await columnExists(prisma, 'gestao_os_assets', 'qrToken'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "gestao_os_assets" ADD COLUMN "qrToken" TEXT;`);
    await prisma.$executeRawUnsafe(`
      UPDATE "gestao_os_assets"
      SET "qrToken" = replace(gen_random_uuid()::text, '-', '')
      WHERE "qrToken" IS NULL OR "qrToken" = '';
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "gestao_os_assets_qrToken_key" ON "gestao_os_assets"("qrToken");`
    );
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_work_orders" (
      "id" TEXT PRIMARY KEY,
      "displayNumber" INTEGER NOT NULL UNIQUE,
      "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL,
      "status" "GestaoOsStatus" NOT NULL DEFAULT 'OPEN',
      "priority" "GestaoOsPriority" NOT NULL DEFAULT 'MEDIUM',
      "maintenanceType" "GestaoOsMaintenanceType",
      "category" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "buildingId" TEXT REFERENCES "gestao_os_buildings"("id") ON DELETE SET NULL,
      "sectorId" TEXT REFERENCES "gestao_os_sectors"("id") ON DELETE SET NULL,
      "placeId" TEXT REFERENCES "gestao_os_places"("id") ON DELETE SET NULL,
      "assetId" TEXT REFERENCES "gestao_os_assets"("id") ON DELETE SET NULL,
      "providerId" TEXT REFERENCES "gestao_os_providers"("id") ON DELETE SET NULL,
      "locationLabel" TEXT,
      "requesterId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "assigneeId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "providerName" TEXT,
      "attachments" JSONB,
      "cancelReason" TEXT,
      "completionNote" TEXT,
      "rating" INTEGER,
      "ratingComment" TEXT,
      "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "approvedAt" TIMESTAMP(3),
      "startedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "closedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!(await columnExists(prisma, 'gestao_os_work_orders', 'companyId'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "gestao_os_work_orders" ADD COLUMN "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL;`
    );
  }
  if (!(await columnExists(prisma, 'gestao_os_work_orders', 'providerId'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "gestao_os_work_orders" ADD COLUMN "providerId" TEXT REFERENCES "gestao_os_providers"("id") ON DELETE SET NULL;`
    );
  }
  if (!(await columnExists(prisma, 'gestao_os_work_orders', 'osNumber'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "gestao_os_work_orders" ADD COLUMN "osNumber" INTEGER;`);
    // Registros já avançados no fluxo passam a ter OS = número antigo.
    await prisma.$executeRawUnsafe(`
      UPDATE "gestao_os_work_orders"
      SET "osNumber" = "displayNumber"
      WHERE "osNumber" IS NULL AND "status" <> 'OPEN';
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "gestao_os_work_orders_osNumber_key" ON "gestao_os_work_orders"("osNumber");`
    );
  }

  // Separa numeração de chamado (displayNumber) da numeração de OS (osNumber / nextOsNumber).
  // Antes a abertura consumia nextOsNumber como displayNumber — corrige uma vez.
  if (!(await columnExists(prisma, 'gestao_os_settings', 'chamadoSeqSeparated'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "gestao_os_settings" ADD COLUMN "chamadoSeqSeparated" BOOLEAN NOT NULL DEFAULT false;`
    );
  }
  const sepRows = await prisma.$queryRaw<{ chamadoSeqSeparated: boolean }[]>`
    SELECT "chamadoSeqSeparated" FROM "gestao_os_settings" WHERE "id" = 'default' LIMIT 1
  `;
  if (!sepRows[0]?.chamadoSeqSeparated) {
    // Evita conflito de UNIQUE em displayNumber durante o remap.
    await prisma.$executeRawUnsafe(`
      UPDATE "gestao_os_work_orders"
      SET "displayNumber" = -ABS("displayNumber")
      WHERE "osNumber" IS NULL;
    `);
    await prisma.$executeRawUnsafe(`
      WITH base AS (
        SELECT COALESCE(MAX("displayNumber"), 0)::int AS max_n
        FROM "gestao_os_work_orders"
        WHERE "osNumber" IS NOT NULL
      ),
      ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "openedAt" ASC, id ASC) AS rn
        FROM "gestao_os_work_orders"
        WHERE "osNumber" IS NULL
      )
      UPDATE "gestao_os_work_orders" AS w
      SET "displayNumber" = (SELECT max_n FROM base) + o.rn
      FROM ordered AS o
      WHERE w.id = o.id;
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "gestao_os_settings"
      SET "chamadoSeqSeparated" = true,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'default';
    `);
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_work_order_events" (
      "id" TEXT PRIMARY KEY,
      "workOrderId" TEXT NOT NULL REFERENCES "gestao_os_work_orders"("id") ON DELETE CASCADE,
      "fromStatus" "GestaoOsStatus",
      "toStatus" "GestaoOsStatus" NOT NULL,
      "note" TEXT,
      "actorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_branches_companyId_idx" ON "gestao_os_branches"("companyId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_providers_companyId_idx" ON "gestao_os_providers"("companyId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_service_categories_companyId_idx" ON "gestao_os_service_categories"("companyId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "gestao_os_memberships_companyId_userId_key" ON "gestao_os_memberships"("companyId", "userId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "gestao_os_service_categories_companyId_name_key" ON "gestao_os_service_categories"("companyId", "name");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_sectors_buildingId_idx" ON "gestao_os_sectors"("buildingId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_places_sectorId_idx" ON "gestao_os_places"("sectorId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_assets_placeId_idx" ON "gestao_os_assets"("placeId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_work_orders_status_idx" ON "gestao_os_work_orders"("status");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_work_orders_requesterId_idx" ON "gestao_os_work_orders"("requesterId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_work_order_events_workOrderId_createdAt_idx" ON "gestao_os_work_order_events"("workOrderId", "createdAt");`
  );

  // SLA + assinaturas + checklist na WO
  for (const col of [
    ['dueAt', 'TIMESTAMP(3)'],
    ['checklistResponses', 'JSONB'],
    ['safetyChecklistResponses', 'JSONB'],
    ['safetyPhotoUrl', 'TEXT'],
    ['signatureRequesterUrl', 'TEXT'],
    ['signatureTechnicianUrl', 'TEXT']
  ] as const) {
    if (!(await columnExists(prisma, 'gestao_os_work_orders', col[0]))) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "gestao_os_work_orders" ADD COLUMN "${col[0]}" ${col[1]};`
      );
    }
  }
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_work_orders_dueAt_idx" ON "gestao_os_work_orders"("dueAt");`
  );

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "GestaoOsPlanType" AS ENUM ('PREVENTIVE', 'PMOC', 'SAFETY');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "GestaoOsDocumentKind" AS ENUM ('MANUAL', 'WARRANTY', 'LAUDO', 'ART', 'OTHER');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_checklist_templates" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL,
      "name" TEXT NOT NULL,
      "planType" "GestaoOsPlanType" NOT NULL DEFAULT 'PREVENTIVE',
      "category" TEXT,
      "items" JSONB NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_maintenance_plans" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL REFERENCES "gestao_os_companies"("id") ON DELETE CASCADE,
      "name" TEXT NOT NULL,
      "planType" "GestaoOsPlanType" NOT NULL DEFAULT 'PREVENTIVE',
      "description" TEXT,
      "category" TEXT,
      "buildingId" TEXT REFERENCES "gestao_os_buildings"("id") ON DELETE SET NULL,
      "assetId" TEXT REFERENCES "gestao_os_assets"("id") ON DELETE SET NULL,
      "checklistId" TEXT REFERENCES "gestao_os_checklist_templates"("id") ON DELETE SET NULL,
      "intervalDays" INTEGER NOT NULL DEFAULT 30,
      "nextDueAt" TIMESTAMP(3) NOT NULL,
      "lastGeneratedAt" TIMESTAMP(3),
      "assigneeId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "scheduledTime" TEXT,
      "technicianIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "rotateTechnicians" BOOLEAN NOT NULL DEFAULT false,
      "rotationIndex" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_plan_runs" (
      "id" TEXT PRIMARY KEY,
      "planId" TEXT NOT NULL REFERENCES "gestao_os_maintenance_plans"("id") ON DELETE CASCADE,
      "workOrderId" TEXT REFERENCES "gestao_os_work_orders"("id") ON DELETE SET NULL,
      "dueAt" TIMESTAMP(3) NOT NULL,
      "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_documents" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL REFERENCES "gestao_os_companies"("id") ON DELETE CASCADE,
      "buildingId" TEXT REFERENCES "gestao_os_buildings"("id") ON DELETE SET NULL,
      "assetId" TEXT REFERENCES "gestao_os_assets"("id") ON DELETE SET NULL,
      "kind" "GestaoOsDocumentKind" NOT NULL DEFAULT 'OTHER',
      "title" TEXT NOT NULL,
      "fileUrl" TEXT NOT NULL,
      "fileName" TEXT,
      "mimeType" TEXT,
      "notes" TEXT,
      "uploadedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_maintenance_plans_companyId_idx" ON "gestao_os_maintenance_plans"("companyId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_maintenance_plans_nextDueAt_idx" ON "gestao_os_maintenance_plans"("nextDueAt");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_documents_companyId_idx" ON "gestao_os_documents"("companyId");`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "gestao_os_work_order_comments" (
      "id" TEXT PRIMARY KEY,
      "workOrderId" TEXT NOT NULL REFERENCES "gestao_os_work_orders"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_work_order_comments_workOrderId_idx" ON "gestao_os_work_order_comments"("workOrderId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "gestao_os_work_order_comments_userId_idx" ON "gestao_os_work_order_comments"("userId");`
  );

  if (await columnExists(prisma, 'gestao_os_maintenance_plans', 'id')) {
    for (const col of [
      ['scheduledTime', 'TEXT'],
      ['technicianIds', `JSONB NOT NULL DEFAULT '[]'::jsonb`],
      ['rotateTechnicians', 'BOOLEAN NOT NULL DEFAULT false'],
      ['rotationIndex', 'INTEGER NOT NULL DEFAULT 0']
    ] as const) {
      if (!(await columnExists(prisma, 'gestao_os_maintenance_plans', col[0]))) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "gestao_os_maintenance_plans" ADD COLUMN "${col[0]}" ${col[1]};`
        );
      }
    }
  }

  if (await columnExists(prisma, 'gestao_os_equipments', 'id')) {
    for (const col of [
      ['defaultSlaHours', 'INTEGER'],
      ['expectedLifeYears', 'INTEGER'],
      ['notes', 'TEXT'],
      ['attachments', 'JSONB']
    ] as const) {
      if (!(await columnExists(prisma, 'gestao_os_equipments', col[0]))) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "gestao_os_equipments" ADD COLUMN "${col[0]}" ${col[1]};`
        );
      }
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "gestao_os_work_orders" ALTER COLUMN "status" SET DEFAULT 'OPEN';`
    );
  } catch {
    /* tabela/enum ainda não prontos */
  }

  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "gestao_os_work_orders"
      SET "status" = 'APPROVED'
      WHERE "status" = 'SAFETY_CHECK'
    `);
  } catch {
    /* enum/tabela ainda não prontos */
  }
}
