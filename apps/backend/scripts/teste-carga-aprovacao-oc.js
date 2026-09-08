/**
 * Teste de carga k6 — Cadeia de aprovação de OC (Compras → Gestor → Diretoria)
 *
 * Pré-requisitos:
 *   1. Backend rodando (padrão: http://localhost:5000)
 *   2. Permissões de aprovação de OC nos usuários teste1–teste3:
 *        npx tsx scripts/conceder-aprovador-oc-teste.ts
 *   3. OCs com status=PENDING_COMPRAS (ex.: teste-carga-cotacao.js)
 *   4. k6 instalado
 *
 * Com 20 OCs em PENDING_COMPRAS:
 *   k6 run -e VUS=5 -e ITERATIONS=20 scripts/teste-carga-aprovacao-oc.js
 *
 * As 3 fases rodam em sequência (Gestor só após Compras; Diretoria só após Gestor).
 * Dentro de cada fase, as aprovações são disparadas em lotes paralelos (http.batch)
 * de até VUS requisições por vez.
 *
 * Variáveis opcionais:
 *   BASE_URL=http://localhost:5000/api
 *   VUS=5
 *   ITERATIONS=20
 *   OC.compras=teste1@loadtest.com
 *   OC.gestor=teste2@loadtest.com
 *   OC.diretoria=teste3@loadtest.com
 *   TEST_PASSWORD=Teste123!
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { getOcApproverCredentials, loginJsonBodyForEmail } from './carga-auth.js';
import { p95, isProductionLoadEnv, k6SetupTimeout } from './carga-thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const VUS = Math.max(1, Number(__ENV.VUS || 5));
const ITERATIONS = Math.max(1, Number(__ENV.ITERATIONS || 20));
// Produção: pool Prisma connection_limit=5 — lotes menores reduzem P2028 sob latência
const BATCH_SIZE = Math.min(VUS, ITERATIONS, isProductionLoadEnv() ? 2 : VUS);

const OC = getOcApproverCredentials();

const ocAprovadaCompras = new Counter('oc_aprovada_compras');
const ocAprovadaGestor = new Counter('oc_aprovada_gestor');
const ocAprovadaDiretoria = new Counter('oc_aprovada_diretoria');

export const options = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    oc_approval_chain: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30m',
    },
  },
  thresholds: {
    oc_aprovada_compras: [`count==${ITERATIONS}`],
    oc_aprovada_gestor: [`count==${ITERATIONS}`],
    oc_aprovada_diretoria: [`count==${ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    // Prod: p95 já chegou a ~15.25s (diretoria); teto 20s com margem
    'http_req_duration{endpoint:approve_oc_compras}': [p95(5000, 20000)],
    'http_req_duration{endpoint:approve_oc_gestor}': [p95(5000, 20000)],
    'http_req_duration{endpoint:approve_oc_diretoria}': [p95(5000, 20000)],
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

function login(email, phaseLabel) {
  const label = phaseLabel || email;
  const res = http.post(
    `${BASE_URL}/auth/login`,
    loginJsonBodyForEmail(email, OC.password),
    { headers: jsonHeaders(), tags: { endpoint: 'login' } },
  );
  const body = parseJson(res);
  const token = body?.data?.token;
  if (res.status !== 200 || !token) {
    const bodyPreview =
      typeof res.body === 'string'
        ? res.body.slice(0, 500)
        : JSON.stringify(body || res.body || null)?.slice(0, 500);
    console.error(
      `[login FAIL] fase=${label} email=${email} httpStatus=${res.status} ` +
        `error=${body?.message || body?.error || '(sem message)'} body=${bodyPreview}`,
    );
    return {
      ok: false,
      email,
      status: res.status,
      message: body?.message || body?.error || null,
      bodyPreview,
    };
  }
  return { ok: true, token, userId: body.data.user?.id, email };
}

function requireLogin(email, phaseLabel) {
  const session = login(email, phaseLabel);
  if (!session?.ok || !session.token) {
    fail(
      `Login ${phaseLabel} falhou (email=${email}). ` +
        `httpStatus=${session?.status ?? '?'} message=${session?.message || '(vazio)'} ` +
        `body=${session?.bodyPreview || '(vazio)'}`,
    );
  }
  return session;
}

function fetchOrdersByStatus(token, status, listTag) {
  const res = http.get(`${BASE_URL}/purchase-orders?status=${encodeURIComponent(status)}&page=1&limit=500`, {
    headers: jsonHeaders(token),
    tags: { endpoint: listTag },
  });
  const body = parseJson(res);
  if (res.status !== 200) {
    throw new Error(`Listagem status=${status} falhou: status=${res.status} body=${res.body}`);
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  return list
    .map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status }))
    .filter((o) => !!o.id);
}

function patchOcStatus(token, ocId, nextStatus, endpointTag, expectedStatus) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/status`,
    JSON.stringify({ status: nextStatus }),
    { headers: jsonHeaders(token), tags: { endpoint: endpointTag } },
  );
  const body = parseJson(res);
  const ok =
    res.status === 200 &&
    body?.success === true &&
    body?.data?.status === expectedStatus;

  check(res, {
    [`${endpointTag} status 200`]: (r) => r.status === 200,
    [`${endpointTag} success true`]: () => body?.success === true,
    [`${endpointTag} status ${expectedStatus}`]: () => body?.data?.status === expectedStatus,
  });

  return ok;
}

function approveBatch(token, orders, nextStatus, endpointTag, expectedStatus, counter) {
  let approved = 0;
  const failures = [];

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const chunk = orders.slice(i, i + BATCH_SIZE);

    if (chunk.length === 1) {
      const oc = chunk[0];
      const ok = patchOcStatus(token, oc.id, nextStatus, endpointTag, expectedStatus);
      if (!ok) {
        console.error(
          `[${endpointTag} FAIL] ocId=${oc.id} orderNumber=${oc.orderNumber || '?'}`,
        );
        failures.push(oc.orderNumber || oc.id);
        continue;
      }
      counter.add(1);
      approved += 1;
      continue;
    }

    const responses = http.batch(
      chunk.map((oc) => [
        'PATCH',
        `${BASE_URL}/purchase-orders/${oc.id}/status`,
        JSON.stringify({ status: nextStatus }),
        {
          headers: jsonHeaders(token),
          tags: { endpoint: endpointTag },
        },
      ]),
    );

    for (let j = 0; j < chunk.length; j++) {
      const oc = chunk[j];
      const res = responses[j];
      const body = parseJson(res);
      const ok =
        res.status === 200 &&
        body?.success === true &&
        body?.data?.status === expectedStatus;

      check(res, {
        [`${endpointTag} batch status 200`]: (r) => r.status === 200,
        [`${endpointTag} batch success`]: () => body?.success === true,
        [`${endpointTag} batch ${expectedStatus}`]: () => body?.data?.status === expectedStatus,
      });

      if (!ok) {
        console.error(
          `[${endpointTag} FAIL] ocId=${oc.id} orderNumber=${oc.orderNumber || '?'} ` +
            `status=${res.status} body=${res.body}`,
        );
        failures.push(oc.orderNumber || oc.id);
        continue;
      }

      counter.add(1);
      approved += 1;
    }

    sleep(0.05);
  }

  if (failures.length > 0) {
    console.error(
      `[${endpointTag}] lote parcial: aprovadas=${approved}/${orders.length} | ` +
        `falhas=${failures.length} → ${failures.join(', ')}`,
    );
    fail(
      `${endpointTag}: ${approved}/${orders.length} aprovadas; falhas: ${failures.join(', ')}`,
    );
  }

  return approved;
}

function runPhaseCompras(orders) {
  console.log(`\n=== Fase 1 — Compras (${orders.length} OC(s), lote=${BATCH_SIZE}) ===`);

  const session = requireLogin(OC.compras, 'Compras');

  const listed = fetchOrdersByStatus(session.token, 'PENDING_COMPRAS', 'list_pending_compras');
  const idSet = new Set(orders.map((o) => o.id));
  const pending = listed.filter((o) => idSet.has(o.id));

  if (pending.length < orders.length) {
    fail(
      `Fase Compras: esperava ${orders.length} OC(s) PENDING_COMPRAS, encontrou ${pending.length} na listagem.`,
    );
  }

  const approved = approveBatch(
    session.token,
    orders,
    'PENDING',
    'approve_oc_compras',
    'PENDING',
    ocAprovadaCompras,
  );

  console.log(`Fase Compras concluída — aprovadas=${approved}`);
  return approved;
}

function runPhaseGestor(orders) {
  console.log(`\n=== Fase 2 — Gestor (${orders.length} OC(s), lote=${BATCH_SIZE}) ===`);
  console.log(`Login Gestor — email=${OC.gestor} (GESTOR_EMAIL ou fallback USER_EMAIL)`);

  const session = requireLogin(OC.gestor, 'Gestor');

  const listed = fetchOrdersByStatus(session.token, 'PENDING', 'list_pending_gestor');
  const idSet = new Set(orders.map((o) => o.id));
  const pending = listed.filter((o) => idSet.has(o.id));

  if (pending.length < orders.length) {
    fail(
      `Fase Gestor: esperava ${orders.length} OC(s) PENDING, encontrou ${pending.length} na listagem.`,
    );
  }

  const approved = approveBatch(
    session.token,
    orders,
    'PENDING_DIRETORIA',
    'approve_oc_gestor',
    'PENDING_DIRETORIA',
    ocAprovadaGestor,
  );

  console.log(`Fase Gestor concluída — aprovadas=${approved}`);
  return approved;
}

function runPhaseDiretoria(orders) {
  console.log(`\n=== Fase 3 — Diretoria (${orders.length} OC(s), lote=${BATCH_SIZE}) ===`);
  console.log(`Login Diretoria — email=${OC.diretoria} (DIRETORIA_EMAIL ou fallback USER_EMAIL)`);

  const session = requireLogin(OC.diretoria, 'Diretoria');

  const listed = fetchOrdersByStatus(session.token, 'PENDING_DIRETORIA', 'list_pending_diretoria');
  const idSet = new Set(orders.map((o) => o.id));
  const pending = listed.filter((o) => idSet.has(o.id));

  if (pending.length < orders.length) {
    fail(
      `Fase Diretoria: esperava ${orders.length} OC(s) PENDING_DIRETORIA, ` +
        `encontrou ${pending.length} na listagem.`,
    );
  }

  const approved = approveBatch(
    session.token,
    orders,
    'APPROVED',
    'approve_oc_diretoria',
    'APPROVED',
    ocAprovadaDiretoria,
  );

  console.log(`Fase Diretoria concluída — aprovadas=${approved}`);
  return approved;
}

export function setup() {
  const health = http.get(`${BASE_URL.replace(/\/api$/, '')}/health`);
  if (health.status !== 200) {
    throw new Error(
      `Backend indisponível em ${BASE_URL}. Suba o servidor antes de rodar o k6.`,
    );
  }

  const session = requireLogin(OC.compras, 'setup/Compras');

  const pending = fetchOrdersByStatus(session.token, 'PENDING_COMPRAS', 'list_pending_compras');
  console.log(
    `setup — PENDING_COMPRAS=${pending.length} | ITERATIONS=${ITERATIONS} | ` +
      `BATCH_SIZE=${BATCH_SIZE} | compras=${OC.compras} | gestor=${OC.gestor} | ` +
      `diretoria=${OC.diretoria}`,
  );

  if (pending.length === 0) {
    throw new Error(
      'Nenhuma OC com status=PENDING_COMPRAS. Gere o lote antes (teste-carga-cotacao.js).',
    );
  }

  if (pending.length < ITERATIONS) {
    throw new Error(
      `Só há ${pending.length} OC(s) PENDING_COMPRAS, mas ITERATIONS=${ITERATIONS}. ` +
        `Ajuste -e ITERATIONS=${pending.length} ou gere mais OCs.`,
    );
  }

  if (pending.length > ITERATIONS) {
    console.warn(
      `Há ${pending.length} PENDING_COMPRAS; vamos aprovar só as primeiras ${ITERATIONS} (ordem da API).`,
    );
  }

  const orders = pending.slice(0, ITERATIONS);

  return { orders };
}

export default function (data) {
  const orders = data.orders;

  runPhaseCompras(orders);
  runPhaseGestor(orders);
  runPhaseDiretoria(orders);

  console.log(
    `\nCadeia concluída — ${orders.length} OC(s): Compras → Gestor → Diretoria → APPROVED`,
  );
}
