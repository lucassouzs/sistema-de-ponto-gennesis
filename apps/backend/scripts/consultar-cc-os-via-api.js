/**
 * Consulta read-only via API (mesmo critério GET /service-orders?costCenterId=...).
 *
 * Uso:
 *   $env:BASE_URL="https://sistema-pontobackend-production.up.railway.app/api"
 *   $env:LOGIN_EMAIL="seu@email.com"
 *   $env:LOGIN_PASSWORD="sua-senha"
 *   node scripts/consultar-cc-os-via-api.js "ADMINISTRAÇÃO CENTRAL" "FHE - DF"
 */

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const LOGIN_EMAIL = process.env.LOGIN_EMAIL || process.env.USER_EMAIL || '';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || process.env.USER_PASSWORD || '';
const MATERIAL_ID = process.env.MATERIAL_ID || 'cmr0wp8qf000n47fczdmn8ybb';

async function login() {
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    throw new Error('Defina LOGIN_EMAIL e LOGIN_PASSWORD (ou USER_EMAIL / USER_PASSWORD).');
  }
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data?.token) {
    throw new Error(`Login falhou (${LOGIN_EMAIL}): HTTP ${res.status} — ${body?.message || 'sem token'}`);
  }
  return body.data.token;
}

async function apiGet(token, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`GET ${path} falhou: HTTP ${res.status} — ${body?.message || ''}`);
  }
  return body;
}

async function findCostCentersByName(token, name) {
  const searches = [name];
  if (name.includes('ADMINISTRA')) {
    searches.push('ADMINISTRACAO CENTRAL', 'ADM CENTRAL');
  }
  if (name.includes('FHE')) {
    searches.push('FHE - DF', 'FHE');
  }

  const seen = new Set();
  const found = [];
  for (const term of searches) {
    const body = await apiGet(
      token,
      `/cost-centers?isActive=true&search=${encodeURIComponent(term)}&limit=50`,
    );
    const list = Array.isArray(body?.data) ? body.data : [];
    for (const cc of list) {
      if (seen.has(cc.id)) continue;
      seen.add(cc.id);
      found.push(cc);
    }
  }

  const exact = found.filter((c) => String(c.name || '').toLowerCase() === name.toLowerCase());
  return exact.length > 0 ? exact : found;
}

async function listServiceOrders(token, costCenterId) {
  const body = await apiGet(token, `/service-orders?costCenterId=${encodeURIComponent(costCenterId)}`);
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
}

async function checkMaterial(token, materialId) {
  // Não há GET público por engineeringMaterial.id — valida via busca do combo da RM.
  const body = await apiGet(
    token,
    `/material-requests/materials?search=${encodeURIComponent(materialId.slice(0, 8))}&limit=100`,
  );
  const list = Array.isArray(body?.data) ? body.data : [];
  const hit = list.find((m) => m?.id === materialId);
  if (hit) {
    return { ok: true, id: hit.id, name: hit.name || hit.description, isActive: hit.isActive !== false };
  }
  return { ok: false, id: materialId, hint: 'ID não retornou na busca /material-requests/materials' };
}

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('Informe nomes: node scripts/consultar-cc-os-via-api.js "CC1" "CC2"');
    process.exit(1);
  }

  console.log(`API: ${BASE_URL}`);
  console.log('Critério OS listável: GET /service-orders retorna >= 1 OS (pleito+contrato no backend)\n');

  const token = await login();

  let materialCheck = null;
  try {
    materialCheck = await checkMaterial(token, MATERIAL_ID);
  } catch (err) {
    materialCheck = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  console.log('=== MATERIAL (RM) ===');
  if (materialCheck?.ok) {
    console.log(`  OK — MATERIAL_ID=${materialCheck.id} | ${materialCheck.name} | ativo=${materialCheck.isActive}`);
  } else {
    console.log(`  ⚠ MATERIAL_ID=${MATERIAL_ID} indisponível ou inativo na API`);
    if (materialCheck?.error) console.log(`    ${materialCheck.error}`);
  }
  console.log('');

  for (const name of names) {
    console.log(`=== ${name} ===`);
    const ccs = await findCostCentersByName(token, name);
    if (ccs.length === 0) {
      console.log('  NÃO encontrado na API.\n');
      continue;
    }

    for (const cc of ccs) {
      const orders = await listServiceOrders(token, cc.id);
      console.log(`  costCenterId: ${cc.id}`);
      console.log(`  code: ${cc.code} | name: ${cc.name} | ativo: ${cc.isActive}`);
      console.log(`  OS listáveis (API): ${orders.length}`);
      if (orders.length === 0) {
        console.log('  ⚠ Sem OS listável — RM não pode ser criada neste CC.');
      } else {
        const first = orders[0];
        console.log(`  serviceOrderId (primeira da API): ${first.id}`);
        console.log(`  label: ${first.label || `${first.numero}/${first.ano}`}`);
        if (first.contractNumber) {
          console.log(`  contrato: ${first.contractNumber} — ${first.contractName || ''}`);
        }
        if (orders.length > 1) {
          console.log(`  (+ ${orders.length - 1} outra(s) OS listável(is))`);
        }
      }
      console.log('');
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
