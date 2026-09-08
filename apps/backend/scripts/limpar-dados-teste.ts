/**
 * Remove dados gerados pelos testes de carga de Suprimentos:
 *   - FinancialControlEntry (ocNumber das OCs de teste)
 *   - MaterialRequest (+ itens)
 *   - QuoteMap vinculados
 *   - PurchaseOrder vinculados (RM/mapa, notes, pagamento k6, ou fornecedor de carga)
 *   - Arquivos em disco referenciados pelas OCs de teste (/uploads/purchase-orders/...)
 *
 * NÃO remove: usuários @loadtest.com, OS-TESTE-CARGA-01, contratos CARGA-TESTE-*,
 *             EngineeringMaterial, etc. (fornecedor de carga só entra via filtro de OC)
 *
 * Uso:
 *   npx tsx scripts/limpar-dados-teste.ts           # dry-run (só lista e conta)
 *   npx tsx scripts/limpar-dados-teste.ts --confirm # deleta de fato
 *
 * Produção (PowerShell, sem alterar .env):
 *   $env:DATABASE_URL = "URL_PUBLICA_RAILWAY"
 *   npx tsx scripts/limpar-dados-teste.ts
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { backendUploadsRoot } from '../src/lib/uploads';

/**
 * Filtro exato usado para identificar RMs de teste.
 * Qualquer registro que bata em um dos OR abaixo será considerado lixo de carga.
 */
const LOADTEST_RM_WHERE: Prisma.MaterialRequestWhereInput = {
  OR: [
    // k6: description: `RM gerada por teste de carga — iter ${__ITER}`
    { description: { contains: 'RM gerada por teste de carga', mode: 'insensitive' } },
    // script de concorrência Node: `RM conc — iter N`
    { description: { contains: 'RM conc', mode: 'insensitive' } },
    // smoke PowerShell: `RM smoke test materialId fixo`
    { description: { contains: 'RM smoke', mode: 'insensitive' } },

    // demandSheet: FD-K6-*, FD-CONC-*, FD-SMOKE-*
    { demandSheet: { startsWith: 'FD-K6-', mode: 'insensitive' } },
    { demandSheet: { startsWith: 'FD-CONC-', mode: 'insensitive' } },
    { demandSheet: { startsWith: 'FD-SMOKE-', mode: 'insensitive' } },

    // obra: Obra carga k6 / Obra conc / Obra smoke k6
    { obra: { contains: 'Obra carga k6', mode: 'insensitive' } },
    { obra: { contains: 'Obra conc', mode: 'insensitive' } },
    { obra: { contains: 'Obra smoke', mode: 'insensitive' } },

    // anexo padrão do k6
    { demandSheetAttachmentName: { equals: 'k6-loadtest.pdf', mode: 'insensitive' } },
    { demandSheetAttachmentUrl: { contains: 'k6-loadtest', mode: 'insensitive' } },
  ],
};

/** Notes gravado em teste-carga-cotacao*.js no generate (observations → notes). */
const LOADTEST_PO_NOTES = 'OC gerada por teste de carga';

/** paymentDetails do fluxo AVISTA k6. */
const LOADTEST_PAYMENT_DETAILS = 'Conta carga k6';

/** pixKey do fluxo AVISTA k6. */
const LOADTEST_PIX_KEY = 'teste@loadtest.com';

/**
 * Fornecedor(es) usados só em carga (ex.: "teste 1" em produção).
 * Override: LOADTEST_SUPPLIER_IDS=id1,id2
 * Vazio: não filtra por fornecedor.
 */
const LOADTEST_SUPPLIER_IDS = String(
  process.env.LOADTEST_SUPPLIER_IDS ?? 'cmq6mgg2i002b25gmoy9u0nwq',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const confirm = process.argv.includes('--confirm');

const PURCHASE_ORDERS_UPLOAD_PREFIX = path.join(backendUploadsRoot, 'purchase-orders');

type PoUploadFields = {
  paymentProofUrl: string | null;
  paymentBoletoUrl: string | null;
  boletoAttachmentUrl: string | null;
  nfAttachments: unknown;
  paymentBoletoInstallments: unknown;
};

function printDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }
  try {
    const u = new URL(raw);
    const kind = /localhost|127\.0\.0\.1/i.test(u.hostname)
      ? 'LOCAL'
      : /railway|rlwy\.net/i.test(u.hostname)
        ? 'PRODUÇÃO (Railway)'
        : 'REMOTO';
    console.log(`Banco alvo — ${kind} | host: ${u.hostname} | database: ${(u.pathname || '/').replace(/^\//, '') || '(default)'}`);
  } catch {
    console.log('Banco alvo — DATABASE_URL definida (host não pôde ser parseado)');
  }
}

/** Converte URL pública `/uploads/purchase-orders/...` em caminho absoluto seguro no disco. */
function uploadUrlToAbsolutePath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const marker = '/uploads/purchase-orders/';
  const idx = trimmed.toLowerCase().indexOf(marker);
  if (idx < 0) return null;

  const fileName = trimmed.slice(idx + marker.length).replace(/^\/+/, '');
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }

  const absolute = path.resolve(PURCHASE_ORDERS_UPLOAD_PREFIX, fileName);
  if (!absolute.startsWith(PURCHASE_ORDERS_UPLOAD_PREFIX + path.sep) && absolute !== PURCHASE_ORDERS_UPLOAD_PREFIX) {
    return null;
  }
  return absolute;
}

function collectPurchaseOrderUploadPaths(po: PoUploadFields): string[] {
  const paths = new Set<string>();

  const addUrl = (url: string | null | undefined) => {
    if (!url) return;
    const abs = uploadUrlToAbsolutePath(url);
    if (abs) paths.add(abs);
  };

  addUrl(po.paymentProofUrl);
  addUrl(po.paymentBoletoUrl);
  addUrl(po.boletoAttachmentUrl);

  if (Array.isArray(po.nfAttachments)) {
    for (const item of po.nfAttachments) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.url === 'string') addUrl(rec.url);
    }
  }

  if (Array.isArray(po.paymentBoletoInstallments)) {
    for (const item of po.paymentBoletoInstallments) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.boletoUrl === 'string') addUrl(rec.boletoUrl);
      if (typeof rec.installmentProofUrl === 'string') addUrl(rec.installmentProofUrl);
    }
  }

  return [...paths];
}

/** Marcadores de OC de carga (independente de status — inclui FINALIZED). */
function buildLoadtestPoMarkerWhere(): Prisma.PurchaseOrderWhereInput[] {
  const parts: Prisma.PurchaseOrderWhereInput[] = [
    { notes: { contains: LOADTEST_PO_NOTES, mode: 'insensitive' } },
    { paymentDetails: { contains: LOADTEST_PAYMENT_DETAILS, mode: 'insensitive' } },
    { pixKey: { equals: LOADTEST_PIX_KEY, mode: 'insensitive' } },
  ];
  if (LOADTEST_SUPPLIER_IDS.length > 0) {
    parts.push({ supplierId: { in: LOADTEST_SUPPLIER_IDS } });
  }
  return parts;
}

async function dumpFinalizedDiagnostic(): Promise<void> {
  if (LOADTEST_SUPPLIER_IDS.length === 0) return;

  const rows = await prisma.purchaseOrder.findMany({
    where: {
      status: 'FINALIZED',
      supplierId: { in: LOADTEST_SUPPLIER_IDS },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      notes: true,
      paymentDetails: true,
      pixKey: true,
      supplierId: true,
      materialRequestId: true,
      materialRequest: {
        select: {
          requestNumber: true,
          description: true,
          demandSheet: true,
          obra: true,
          demandSheetAttachmentName: true,
          status: true,
        },
      },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `\n=== Diagnóstico FINALIZED + fornecedor carga (${LOADTEST_SUPPLIER_IDS.join(', ')}) ===`,
  );
  console.log(`  Total: ${rows.length}`);
  for (const po of rows.slice(0, 20)) {
    const rm = po.materialRequest;
    console.log(`  --- ${po.orderNumber} [${po.status}] supplier=${po.supplier?.name ?? po.supplierId}`);
    console.log(`      notes=${JSON.stringify(po.notes)}`);
    console.log(`      paymentDetails=${JSON.stringify(po.paymentDetails)}`);
    console.log(`      pixKey=${JSON.stringify(po.pixKey)}`);
    if (rm) {
      console.log(
        `      RM ${rm.requestNumber} [${rm.status}] desc=${JSON.stringify(rm.description)}`,
      );
      console.log(
        `      demandSheet=${JSON.stringify(rm.demandSheet)} | obra=${JSON.stringify(rm.obra)} | anexo=${JSON.stringify(rm.demandSheetAttachmentName)}`,
      );
    } else {
      console.log('      RM vinculada: null (materialRequestId ausente)');
    }
  }
  if (rows.length > 20) console.log(`  ... e mais ${rows.length - 20}`);
}

async function main() {
  printDatabaseTarget();
  console.log(confirm ? '=== MODO --confirm (vai deletar) ===' : '=== DRY-RUN (nada será deletado) ===');
  console.log('\nFiltro MaterialRequestWhereInput:');
  console.log(JSON.stringify(LOADTEST_RM_WHERE, null, 2));
  console.log('\nMarcadores PurchaseOrder extras:');
  console.log(
    JSON.stringify(
      {
        notesContains: LOADTEST_PO_NOTES,
        paymentDetailsContains: LOADTEST_PAYMENT_DETAILS,
        pixKeyEquals: LOADTEST_PIX_KEY,
        supplierIds: LOADTEST_SUPPLIER_IDS,
      },
      null,
      2,
    ),
  );

  await dumpFinalizedDiagnostic();

  const matchedRmsByText = await prisma.materialRequest.findMany({
    where: LOADTEST_RM_WHERE,
    select: {
      id: true,
      requestNumber: true,
      description: true,
      demandSheet: true,
      obra: true,
      createdAt: true,
      status: true,
      _count: { select: { items: true, purchaseOrders: true, quoteMaps: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let rmIds = matchedRmsByText.map((rm) => rm.id);

  // OCs por marcadores k6 / fornecedor de carga (inclui FINALIZED mesmo se RM não bater no texto)
  const posByMarkers = await prisma.purchaseOrder.findMany({
    where: { OR: buildLoadtestPoMarkerWhere() },
    select: {
      id: true,
      materialRequestId: true,
      quoteMapId: true,
    },
  });

  const extraRmIds = posByMarkers
    .map((po) => po.materialRequestId)
    .filter((id): id is string => !!id && !rmIds.includes(id));

  if (extraRmIds.length > 0) {
    const extraRms = await prisma.materialRequest.findMany({
      where: { id: { in: extraRmIds } },
      select: {
        id: true,
        requestNumber: true,
        description: true,
        demandSheet: true,
        obra: true,
        createdAt: true,
        status: true,
        _count: { select: { items: true, purchaseOrders: true, quoteMaps: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    rmIds = [...rmIds, ...extraRms.map((r) => r.id)];
    matchedRmsByText.push(...extraRms);
  }

  const matchedRms = matchedRmsByText;

  const quoteMaps = rmIds.length
    ? await prisma.quoteMap.findMany({
        where: { materialRequestId: { in: rmIds } },
        select: {
          id: true,
          materialRequestId: true,
          createdAt: true,
          _count: { select: { purchaseOrders: true, suppliers: true, winners: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const quoteMapIds = quoteMaps.map((qm) => qm.id);
  const markerPoIds = posByMarkers.map((po) => po.id);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      OR: [
        ...(rmIds.length ? [{ materialRequestId: { in: rmIds } }] : []),
        ...(quoteMapIds.length ? [{ quoteMapId: { in: quoteMapIds } }] : []),
        ...(markerPoIds.length ? [{ id: { in: markerPoIds } }] : []),
        ...buildLoadtestPoMarkerWhere(),
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      materialRequestId: true,
      quoteMapId: true,
      notes: true,
      status: true,
      createdAt: true,
      paymentProofUrl: true,
      paymentBoletoUrl: true,
      boletoAttachmentUrl: true,
      nfAttachments: true,
      paymentBoletoInstallments: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const poIds = purchaseOrders.map((po) => po.id);
  const poOrderNumbers = purchaseOrders
    .map((po) => po.orderNumber?.trim())
    .filter((n): n is string => !!n);

  const financialEntries =
    poOrderNumbers.length > 0
      ? await prisma.financialControlEntry.findMany({
          where: {
            OR: poOrderNumbers.map((ocNumber) => ({
              ocNumber: { equals: ocNumber, mode: 'insensitive' as const },
            })),
          },
          select: {
            id: true,
            ocNumber: true,
            paymentMonth: true,
            paymentYear: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

  const financialEntryIds = financialEntries.map((e) => e.id);

  const uploadPaths = [
    ...new Set(purchaseOrders.flatMap((po) => collectPurchaseOrderUploadPaths(po))),
  ];
  const existingUploadPaths = uploadPaths.filter((p) => fs.existsSync(p));
  const missingUploadPaths = uploadPaths.length - existingUploadPaths.length;

  const rmItemCount = matchedRms.reduce((sum, rm) => sum + rm._count.items, 0);
  const poItemCount = purchaseOrders.reduce((sum, po) => sum + po._count.items, 0);
  const finalizedCount = purchaseOrders.filter((po) => po.status === 'FINALIZED').length;

  console.log('\n=== CONTAGEM (seria removido) ===');
  console.log(`  MaterialRequest:         ${matchedRms.length}`);
  console.log(`  MaterialRequestItem:     ${rmItemCount}`);
  console.log(`  QuoteMap:                ${quoteMaps.length}`);
  console.log(`  PurchaseOrder:           ${purchaseOrders.length} (FINALIZED=${finalizedCount})`);
  console.log(`  PurchaseOrderItem:       ${poItemCount} (cascade ao deletar OC)`);
  console.log(`  FinancialControlEntry:   ${financialEntries.length}`);
  console.log(`  Arquivos upload (refs):  ${uploadPaths.length} (${existingUploadPaths.length} existem no disco)`);
  if (missingUploadPaths > 0) {
    console.log(`    (${missingUploadPaths} referência(s) sem arquivo — ignoradas na exclusão)`);
  }

  if (
    matchedRms.length === 0 &&
    quoteMaps.length === 0 &&
    purchaseOrders.length === 0 &&
    financialEntries.length === 0 &&
    uploadPaths.length === 0
  ) {
    console.log('\nNada a limpar.');
    return;
  }

  if (matchedRms.length > 0) {
    console.log('\nPrévia RMs (até 10):');
    for (const rm of matchedRms.slice(0, 10)) {
      console.log(
        `  ${rm.requestNumber} [${rm.status}] | FD=${rm.demandSheet ?? '-'} | ` +
          `itens=${rm._count.items} qm=${rm._count.quoteMaps} oc=${rm._count.purchaseOrders}`,
      );
    }
    if (matchedRms.length > 10) console.log(`  ... e mais ${matchedRms.length - 10} RM(s)`);
  }

  if (quoteMaps.length > 0) {
    console.log('\nPrévia QuoteMaps (até 10):');
    for (const qm of quoteMaps.slice(0, 10)) {
      console.log(
        `  ${qm.id} | rm=${qm.materialRequestId} | ocs=${qm._count.purchaseOrders} | ` +
          `fornecedores=${qm._count.suppliers}`,
      );
    }
    if (quoteMaps.length > 10) console.log(`  ... e mais ${quoteMaps.length - 10}`);
  }

  if (purchaseOrders.length > 0) {
    console.log('\nPrévia PurchaseOrders (até 15):');
    for (const po of purchaseOrders.slice(0, 15)) {
      console.log(
        `  ${po.orderNumber} [${po.status}] | rm=${po.materialRequestId ?? 'null'} | ` +
          `qm=${po.quoteMapId ?? 'null'} | notes=${(po.notes ?? '').slice(0, 40)}`,
      );
    }
    if (purchaseOrders.length > 15) console.log(`  ... e mais ${purchaseOrders.length - 15}`);
  }

  if (financialEntries.length > 0) {
    console.log('\nPrévia FinancialControl (até 10):');
    for (const entry of financialEntries.slice(0, 10)) {
      console.log(
        `  ${entry.id} | oc=${entry.ocNumber ?? '-'} | ${entry.paymentMonth}/${entry.paymentYear} | ` +
          `status=${entry.status}`,
      );
    }
    if (financialEntries.length > 10) {
      console.log(`  ... e mais ${financialEntries.length - 10}`);
    }
  }

  if (existingUploadPaths.length > 0) {
    console.log('\nPrévia arquivos upload (até 10):');
    for (const filePath of existingUploadPaths.slice(0, 10)) {
      console.log(`  ${path.relative(backendUploadsRoot, filePath)}`);
    }
    if (existingUploadPaths.length > 10) {
      console.log(`  ... e mais ${existingUploadPaths.length - 10}`);
    }
  }

  console.log('\nOrdem de exclusão (--confirm):');
  console.log('  1. FinancialControlEntry (ocNumber das OCs de teste)');
  console.log('  2. PurchaseOrder (+ itens / shortfalls / deliveries em cascade)');
  console.log('  3. QuoteMap (+ suppliers/winners/supplierItems em cascade)');
  console.log('  4. MaterialRequestItem');
  console.log('  5. MaterialRequest');
  console.log('  6. Arquivos em apps/backend/uploads/purchase-orders/ referenciados pelas OCs');
  console.log('  NÃO toca User, ServiceOrder, Contract, Supplier');
  console.log('  NÃO varre a pasta inteira — só URLs gravadas nas OCs de teste (seguro).');

  if (!confirm) {
    console.log('\nDry-run concluído. Para deletar de fato:');
    console.log('  npx tsx scripts/limpar-dados-teste.ts --confirm');
    return;
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const financial =
      financialEntryIds.length > 0
        ? await tx.financialControlEntry.deleteMany({ where: { id: { in: financialEntryIds } } })
        : { count: 0 };

    const pos =
      poIds.length > 0
        ? await tx.purchaseOrder.deleteMany({ where: { id: { in: poIds } } })
        : { count: 0 };

    const qms =
      quoteMapIds.length > 0
        ? await tx.quoteMap.deleteMany({ where: { id: { in: quoteMapIds } } })
        : { count: 0 };

    const items =
      rmIds.length > 0
        ? await tx.materialRequestItem.deleteMany({ where: { materialRequestId: { in: rmIds } } })
        : { count: 0 };

    const rms =
      rmIds.length > 0
        ? await tx.materialRequest.deleteMany({ where: { id: { in: rmIds } } })
        : { count: 0 };

    return {
      financialEntries: financial.count,
      purchaseOrders: pos.count,
      quoteMaps: qms.count,
      items: items.count,
      rms: rms.count,
    };
  });

  let filesRemoved = 0;
  let filesFailed = 0;
  for (const filePath of existingUploadPaths) {
    try {
      fs.unlinkSync(filePath);
      filesRemoved += 1;
    } catch (err) {
      filesFailed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  aviso: não foi possível remover ${filePath}: ${message}`);
    }
  }

  console.log('\n=== DELETADO ===');
  console.log(`  FinancialControlEntry: ${deleted.financialEntries}`);
  console.log(`  PurchaseOrder:         ${deleted.purchaseOrders}`);
  console.log(`  QuoteMap:              ${deleted.quoteMaps}`);
  console.log(`  MaterialRequestItem:   ${deleted.items}`);
  console.log(`  MaterialRequest:       ${deleted.rms}`);
  console.log(`  Arquivos upload:       ${filesRemoved}${filesFailed > 0 ? ` (${filesFailed} falha(s))` : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
