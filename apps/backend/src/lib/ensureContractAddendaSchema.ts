import type { PrismaClient } from '@prisma/client';

/**
 * Produção pode ficar sem a tabela `contract_addenda` se `migrate deploy` não rodou.
 * DDL idempotente (IF NOT EXISTS) — mesmo SQL da migration 20260408100000_contract_addenda.
 */
export async function ensureContractAddendaTable(prisma: PrismaClient): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'contract_addenda'
    `;
    if ((rows[0]?.c ?? BigInt(0)) > BigInt(0)) return;

    console.warn(
      '[Schema] Tabela contract_addenda ausente — criando automaticamente (aditivos de contrato). ' +
        'Prefira garantir deploy com: cd apps/backend && npx prisma migrate deploy.'
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

    console.log('[Schema] Tabela contract_addenda verificada/criada.');
  } catch (e) {
    console.error('[Schema] Falha ao garantir contract_addenda:', e);
  }
}
