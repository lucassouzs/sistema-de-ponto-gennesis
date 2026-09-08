/**
 * Teste de carga k6 — Mapa de Cotação → geração de OC
 *
 * Pré-requisitos:
 *   1. Backend rodando (padrão: http://localhost:5000)
 *   2. teste1@loadtest.com autenticável
 *   3. N RMs com status=APPROVED (sem gerar OC duplicada no mesmo mapa)
 *   4. Fornecedor Fort material existente (padrão abaixo)
 *   5. k6 instalado
 *
 * Com 20 RMs aprovadas:
 *   k6 run -e VUS=5 -e ITERATIONS=20 scripts/teste-carga-cotacao.js
 *
 * Variáveis opcionais:
 *   BASE_URL=http://localhost:5000/api
 *   VUS=5
 *   ITERATIONS=20
 *   SUPPLIER_ID=...           (obrigatório — consulte: npx tsx scripts/consultar-fornecedores-ativos.ts)
 *   USER_EMAIL=...            (obrigatório)
 *   USER_PASSWORD=...         (obrigatório)
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

import { getUserCredentials, loginJsonBody, requireSupplierId } from './carga-auth.js';
import { p95, k6SetupTimeout } from './carga-thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const VUS = Math.max(1, Number(__ENV.VUS || 5));
const ITERATIONS = Math.max(1, Number(__ENV.ITERATIONS || 20));
const SUPPLIER_ID = requireSupplierId();
const UNIT_PRICE = Number(__ENV.UNIT_PRICE || 10.5);
const USER = getUserCredentials();

const quoteMapCreated = new Counter('quote_map_created');
const quotesSaved = new Counter('quotes_saved');
const ocGenerated = new Counter('oc_generated');

export const options = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    cotacao: {
      executor: 'shared-iterations',
      vus: Math.min(VUS, ITERATIONS),
      iterations: ITERATIONS,
      maxDuration: '20m',
    },
  },
  thresholds: {
    quote_map_created: [`count==${ITERATIONS}`],
    quotes_saved: [`count==${ITERATIONS}`],
    oc_generated: [`count==${ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{endpoint:quote_map_create}': [p95(5000)],
    'http_req_duration{endpoint:quotes_save}': [p95(5000)],
    // Prod: generate já mediu ~8s avg / ~11s p95 (lock + latência Railway)
    'http_req_duration{endpoint:oc_generate}': [p95(8000, 30000)],
  },
};

function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    loginJsonBody(USER),
    { headers: jsonHeaders(), tags: { endpoint: 'login' } },
  );
  const body = parseJson(res);
  const token = body?.data?.token;
  if (res.status !== 200 || !token) return null;
  return { token, userId: body.data.user?.id };
}

function fetchApprovedSummaries(token) {
  const res = http.get(`${BASE_URL}/material-requests?status=APPROVED&page=1&limit=500`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'list_approved' },
  });
  const body = parseJson(res);
  if (res.status !== 200) {
    throw new Error(`Listagem APPROVED falhou: status=${res.status} body=${res.body}`);
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  return list
    .map((rm) => ({ id: rm.id, requestNumber: rm.requestNumber }))
    .filter((rm) => !!rm.id);
}

function fetchRmDetail(token, rmId) {
  const res = http.get(`${BASE_URL}/material-requests/${rmId}`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'get_rm' },
  });
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true && body?.data?.id;
  check(res, {
    'get RM status 200': (r) => r.status === 200,
    'get RM tem data': () => !!body?.data?.id,
  });
  if (!ok) {
    console.error(`[get_rm FAIL] rmId=${rmId} status=${res.status} body=${res.body}`);
    return null;
  }
  const items = Array.isArray(body.data.items) ? body.data.items : [];
  return {
    id: body.data.id,
    requestNumber: body.data.requestNumber,
    items: items.map((it) => ({ id: it.id, quantity: Number(it.quantity) })).filter((it) => !!it.id),
  };
}

function createQuoteMap(token, materialRequestId) {
  const res = http.post(
    `${BASE_URL}/quote-maps`,
    JSON.stringify({ materialRequestId }),
    { headers: jsonHeaders(token), tags: { endpoint: 'quote_map_create' } },
  );
  const body = parseJson(res);
  const ok = res.status === 201 && body?.success === true && !!body?.data?.id;
  check(res, {
    'quote-map status 201': (r) => r.status === 201,
    'quote-map retornou id': () => !!body?.data?.id,
  });
  if (!ok) {
    console.error(
      `[quote_map_create FAIL] VU=${__VU} iter=${exec.scenario.iterationInTest} ` +
        `rmId=${materialRequestId} status=${res.status} body=${res.body}`,
    );
    return null;
  }
  quoteMapCreated.add(1);
  return body.data.id;
}

function saveQuotes(token, mapId, itemIds) {
  const freightBySupplier = { [SUPPLIER_ID]: 0 };
  const unitPrices = itemIds.map((materialRequestItemId) => ({
    supplierId: SUPPLIER_ID,
    materialRequestItemId,
    unitPrice: UNIT_PRICE,
  }));

  const res = http.put(
    `${BASE_URL}/quote-maps/${mapId}/quotes`,
    JSON.stringify({
      supplierIds: [SUPPLIER_ID],
      freightBySupplier,
      unitPrices,
    }),
    { headers: jsonHeaders(token), tags: { endpoint: 'quotes_save' } },
  );
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true && body?.data?.ok === true;
  check(res, {
    'quotes status 200': (r) => r.status === 200,
    'quotes ok true': () => body?.data?.ok === true,
  });
  if (!ok) {
    console.error(
      `[quotes_save FAIL] VU=${__VU} iter=${exec.scenario.iterationInTest} ` +
        `mapId=${mapId} status=${res.status} body=${res.body}`,
    );
    return false;
  }
  quotesSaved.add(1);
  return true;
}

function generateOc(token, mapId) {
  const payload = {
    generateSupplierIds: [SUPPLIER_ID],
    paymentBySupplier: [
      {
        supplierId: SUPPLIER_ID,
        paymentType: 'AVISTA',
        paymentCondition: 'AVISTA',
        paymentDetails: 'Conta carga k6',
        pixKeyType: 'EMAIL',
        pixKey: 'teste@loadtest.com',
        observations: 'OC gerada por teste de carga',
      },
    ],
  };

  const res = http.post(
    `${BASE_URL}/quote-maps/${mapId}/generate`,
    JSON.stringify(payload),
    { headers: jsonHeaders(token), tags: { endpoint: 'oc_generate' } },
  );
  const body = parseJson(res);
  const orders = body?.data?.orders;
  const ok =
    res.status === 200 &&
    body?.success === true &&
    Array.isArray(orders) &&
    orders.length > 0;

  check(res, {
    'generate status 200': (r) => r.status === 200,
    'generate success true': () => body?.success === true,
    'generate retornou OC': () => Array.isArray(orders) && orders.length > 0,
  });

  if (!ok) {
    console.error(
      `[oc_generate FAIL] VU=${__VU} iter=${exec.scenario.iterationInTest} ` +
        `mapId=${mapId} status=${res.status} body=${res.body}`,
    );
    return false;
  }

  ocGenerated.add(1);
  return true;
}

export function setup() {
  const health = http.get(`${BASE_URL.replace(/\/api$/, '')}/health`);
  if (health.status !== 200) {
    throw new Error(
      `Backend indisponível em ${BASE_URL}. Suba o servidor antes de rodar o k6.`,
    );
  }

  const session = login();
  if (!session?.token) {
    throw new Error(`Login falhou (${USER.email}).`);
  }

  const approved = fetchApprovedSummaries(session.token);
  console.log(
    `setup — APPROVED=${approved.length} | ITERATIONS=${ITERATIONS} | ` +
      `VUS=${Math.min(VUS, ITERATIONS)} | supplier=${SUPPLIER_ID} | user=${USER.email}`,
  );

  if (approved.length === 0) {
    throw new Error(
      'Nenhuma RM com status=APPROVED. Aprove um lote antes (teste-carga-aprovacao-rm.js).',
    );
  }

  if (approved.length < ITERATIONS) {
    throw new Error(
      `Só há ${approved.length} RM(s) APPROVED, mas ITERATIONS=${ITERATIONS}. ` +
        `Ajuste -e ITERATIONS=${approved.length} ou aprove mais RMs.`,
    );
  }

  if (approved.length > ITERATIONS) {
    console.warn(
      `Há ${approved.length} APPROVED; processaremos só as primeiras ${ITERATIONS} (ordem da API).`,
    );
  }

  return {
    token: session.token,
    rms: approved.slice(0, ITERATIONS),
  };
}

export default function (data) {
  const idx = exec.scenario.iterationInTest;
  if (idx < 0 || idx >= data.rms.length) {
    fail(`Índice inválido iterationInTest=${idx} (rms=${data.rms.length})`);
  }

  const summary = data.rms[idx];
  const detail = fetchRmDetail(data.token, summary.id);
  if (!detail || detail.items.length === 0) {
    fail(
      `VU ${__VU}: RM ${summary.requestNumber || summary.id} sem itens ` +
        `(iterationInTest=${idx})`,
    );
  }

  const mapId = createQuoteMap(data.token, detail.id);
  if (!mapId) {
    fail(
      `VU ${__VU}: falha ao criar quote-map para ${detail.requestNumber || detail.id}`,
    );
  }

  const saved = saveQuotes(
    data.token,
    mapId,
    detail.items.map((it) => it.id),
  );
  if (!saved) {
    fail(`VU ${__VU}: falha ao salvar quotes mapId=${mapId}`);
  }

  const generated = generateOc(data.token, mapId);
  if (!generated) {
    fail(`VU ${__VU}: falha ao gerar OC mapId=${mapId}`);
  }

  check(null, {
    'pipeline cotação completo': () => true,
  });

  sleep(0.1);
}
