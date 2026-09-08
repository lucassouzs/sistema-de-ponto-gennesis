/**
 * Diagnóstico read-only via API: OCs FINALIZED do fornecedor de carga + campos da RM.
 *
 * Uso:
 *   $env:BASE_URL="https://sistema-pontobackend-production.up.railway.app/api"
 *   $env:USER_EMAIL="..."
 *   $env:USER_PASSWORD="..."
 *   $env:SUPPLIER_ID="cmq6mgg2i002b25gmoy9u0nwq"
 *   node scripts/consultar-ocs-finalizadas-teste.js
 */

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const USER_EMAIL = (process.env.USER_EMAIL || '').trim();
const USER_PASSWORD = (process.env.USER_PASSWORD || '').trim();
const SUPPLIER_ID = (process.env.SUPPLIER_ID || 'cmq6mgg2i002b25gmoy9u0nwq').trim();

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  const token = body?.data?.token;
  if (!res.ok || !token) {
    throw new Error(`Login falhou: status=${res.status} body=${JSON.stringify(body)}`);
  }
  return token;
}

async function getJson(token, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`GET ${path} falhou: status=${res.status} body=${JSON.stringify(body)}`);
  }
  return body;
}

function matchesLoadtestRm(rm) {
  if (!rm) return { ok: false, reasons: ['RM ausente'] };
  const reasons = [];
  const desc = String(rm.description || '');
  const fd = String(rm.demandSheet || '');
  const obra = String(rm.obra || '');
  const anexo = String(rm.demandSheetAttachmentName || '');
  if (/RM gerada por teste de carga/i.test(desc)) reasons.push('description~RM gerada por teste de carga');
  if (/^FD-K6-/i.test(fd)) reasons.push('demandSheet~FD-K6-');
  if (/Obra carga k6/i.test(obra)) reasons.push('obra~Obra carga k6');
  if (/^k6-loadtest\.pdf$/i.test(anexo)) reasons.push('anexo=k6-loadtest.pdf');
  return { ok: reasons.length > 0, reasons };
}

function matchesLoadtestPo(po) {
  const reasons = [];
  const notes = String(po.notes || '');
  const pay = String(po.paymentDetails || '');
  const pix = String(po.pixKey || '');
  if (/OC gerada por teste de carga/i.test(notes)) reasons.push('notes~OC gerada por teste de carga');
  if (/Conta carga k6/i.test(pay)) reasons.push('paymentDetails~Conta carga k6');
  if (/^teste@loadtest\.com$/i.test(pix)) reasons.push('pixKey=teste@loadtest.com');
  if (po.supplierId === SUPPLIER_ID || po.supplier?.id === SUPPLIER_ID) {
    reasons.push(`supplierId=${SUPPLIER_ID}`);
  }
  return { ok: reasons.length > 0, reasons };
}

async function main() {
  if (!USER_EMAIL || !USER_PASSWORD) {
    throw new Error('Defina USER_EMAIL e USER_PASSWORD');
  }

  console.log(`API: ${BASE_URL}`);
  console.log(`Fornecedor: ${SUPPLIER_ID}`);
  const token = await login();

  const listBody = await getJson(
    token,
    `/purchase-orders?status=FINALIZED&supplierId=${encodeURIComponent(SUPPLIER_ID)}&page=1&limit=200`,
  );
  const list = Array.isArray(listBody?.data) ? listBody.data : [];
  console.log(`\nOCs FINALIZED com supplierId=${SUPPLIER_ID}: ${list.length}\n`);

  let wouldMatchOld = 0;
  let wouldMatchNew = 0;

  for (const summary of list) {
    const detailBody = await getJson(token, `/purchase-orders/${summary.id}`);
    const po = detailBody?.data || detailBody;
    const rm = po.materialRequest || null;
    const rmMatch = matchesLoadtestRm(rm);
    const poMatch = matchesLoadtestPo(po);
    const oldPoOnlyNotes = /OC gerada por teste de carga/i.test(String(po.notes || ''));
    const oldWouldCatch = rmMatch.ok || oldPoOnlyNotes;
    const newWouldCatch = rmMatch.ok || poMatch.ok;
    if (oldWouldCatch) wouldMatchOld += 1;
    if (newWouldCatch) wouldMatchNew += 1;

    console.log(`--- ${po.orderNumber || summary.orderNumber} [${po.status}] ---`);
    console.log(`  notes: ${JSON.stringify(po.notes ?? null)}`);
    console.log(`  paymentDetails: ${JSON.stringify(po.paymentDetails ?? null)}`);
    console.log(`  pixKey: ${JSON.stringify(po.pixKey ?? null)}`);
    if (rm) {
      console.log(`  RM ${rm.requestNumber} [${rm.status}]`);
      console.log(`  description: ${JSON.stringify(rm.description ?? null)}`);
      console.log(`  demandSheet: ${JSON.stringify(rm.demandSheet ?? null)}`);
      console.log(`  obra: ${JSON.stringify(rm.obra ?? null)}`);
      console.log(`  demandSheetAttachmentName: ${JSON.stringify(rm.demandSheetAttachmentName ?? null)}`);
    } else {
      console.log('  RM: null');
    }
    console.log(`  filtro ANTIGO capturaria? ${oldWouldCatch ? 'SIM' : 'NÃO'} (RM texto=${rmMatch.ok} | notes=${oldPoOnlyNotes})`);
    console.log(`  filtro NOVO capturaria? ${newWouldCatch ? 'SIM' : 'NÃO'} (${[...rmMatch.reasons, ...poMatch.reasons].join(' | ') || 'nenhum'})`);
    console.log('');
  }

  console.log('=== Resumo ===');
  console.log(`  Total FINALIZED (fornecedor): ${list.length}`);
  console.log(`  Capturáveis pelo filtro ANTIGO: ${wouldMatchOld}`);
  console.log(`  Capturáveis pelo filtro NOVO:   ${wouldMatchNew}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
