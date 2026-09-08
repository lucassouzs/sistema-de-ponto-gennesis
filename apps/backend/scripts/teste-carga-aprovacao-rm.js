/**
 * Teste de carga k6 — Aprovação em massa de RMs
 *
 * Pré-requisitos:
 *   1. Backend rodando (padrão: http://localhost:5000)
 *   2. teste1@loadtest.com com permissão de aprovar RM:
 *        npx tsx scripts/conceder-aprovador-rm-teste.ts
 *   3. RMs PENDING no banco (ex.: seed do teste-carga-suprimentos.js)
 *   4. k6 instalado
 *
 * Com 50 RMs pendentes (VUs padrão = 5):
 *   k6 run -e VUS=5 -e ITERATIONS=50 scripts/teste-carga-aprovacao-rm.js
 *
 * Nota: o k6 não permite HTTP no init para descobrir o tamanho da fila,
 * então ITERATIONS deve refletir o número de PENDING (ex.: 50).
 * O setup valida que existam pelo menos ITERATIONS RMs PENDING e
 * distribui UMA RM distinta por iteração (iterationInTest).
 *
 * Variáveis opcionais:
 *   BASE_URL=http://localhost:5000/api
 *   VUS=5
 *   ITERATIONS=50
 *   USER_EMAIL=... (obrigatório)
 *   USER_PASSWORD=... (obrigatório)
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { getUserCredentials, loginJsonBody } from './carga-auth.js';
import { p95, k6SetupTimeout } from './carga-thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const VUS = Math.max(1, Number(__ENV.VUS || 5));
const ITERATIONS = Math.max(1, Number(__ENV.ITERATIONS || 50));
const USER = getUserCredentials();

/** Só incrementa em PATCH com status 200 + success. */
const rmApproved = new Counter('rm_approved');

export const options = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    approve_rms: {
      executor: 'shared-iterations',
      // Não usar mais VUs do que iterações
      vus: Math.min(VUS, ITERATIONS),
      iterations: ITERATIONS,
      maxDuration: '15m',
    },
  },
  thresholds: {
    rm_approved: [`count==${ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{endpoint:approve_rm}': [p95(5000)],
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

function loginApprover() {
  const res = http.post(`${BASE_URL}/auth/login`, loginJsonBody(USER), {
    headers: jsonHeaders(),
    tags: { endpoint: 'login' },
  });
  const body = parseJson(res);
  const token = body?.data?.token;
  if (res.status !== 200 || !token) {
    return null;
  }
  return { token, userId: body.data.user?.id };
}

function fetchPendingRms(token) {
  const res = http.get(`${BASE_URL}/material-requests?status=PENDING&page=1&limit=500`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'list_pending' },
  });
  const body = parseJson(res);
  if (res.status !== 200) {
    throw new Error(`Listagem PENDING falhou: status=${res.status} body=${res.body}`);
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  return list
    .map((rm) => ({ id: rm.id, requestNumber: rm.requestNumber, status: rm.status }))
    .filter((rm) => !!rm.id);
}

function approveRm(token, rmId) {
  const res = http.patch(
    `${BASE_URL}/material-requests/${rmId}/status`,
    JSON.stringify({ status: 'APPROVED' }),
    { headers: jsonHeaders(token), tags: { endpoint: 'approve_rm' } },
  );

  const body = parseJson(res);
  const ok =
    res.status === 200 &&
    body?.success === true &&
    body?.data?.status === 'APPROVED';

  check(res, {
    'approve status 200': (r) => r.status === 200,
    'approve success true': () => body?.success === true,
    'approve status APPROVED': () => body?.data?.status === 'APPROVED',
  });

  if (!ok) {
    console.error(
      `[approve FAIL] VU=${__VU} iterInTest=${exec.scenario.iterationInTest} ` +
        `rmId=${rmId} status=${res.status} body=${res.body}`,
    );
    return false;
  }

  rmApproved.add(1);
  return true;
}

export function setup() {
  const health = http.get(`${BASE_URL.replace(/\/api$/, '')}/health`);
  if (health.status !== 200) {
    throw new Error(
      `Backend indisponível em ${BASE_URL}. Suba o servidor antes de rodar o k6.`,
    );
  }

  const session = loginApprover();
  if (!session?.token) {
    throw new Error(
      `Login do aprovador falhou (${USER.email}). ` +
        `Confira senha e rode: npx tsx scripts/conceder-aprovador-rm-teste.ts`,
    );
  }

  const pending = fetchPendingRms(session.token);
  console.log(
    `setup — PENDING=${pending.length} | ITERATIONS=${ITERATIONS} | VUS=${Math.min(VUS, ITERATIONS)} | aprovador=${USER.email}`,
  );

  if (pending.length === 0) {
    throw new Error(
      'Nenhuma RM com status=PENDING. Gere o lote antes (MODE=seed ITERATIONS=50).',
    );
  }

  if (pending.length < ITERATIONS) {
    throw new Error(
      `Só há ${pending.length} RM(s) PENDING, mas ITERATIONS=${ITERATIONS}. ` +
        `Ajuste -e ITERATIONS=${pending.length} ou gere mais RMs.`,
    );
  }

  if (pending.length > ITERATIONS) {
    console.warn(
      `Há ${pending.length} PENDING; vamos aprovar só as primeiras ${ITERATIONS} (ordem da API).`,
    );
  }

  // Uma RM por índice de iteração — sem repetir
  const assigned = pending.slice(0, ITERATIONS);

  return {
    token: session.token,
    rms: assigned,
  };
}

export default function (data) {
  const idx = exec.scenario.iterationInTest;
  if (idx < 0 || idx >= data.rms.length) {
    fail(`Índice inválido iterationInTest=${idx} (rms=${data.rms.length})`);
  }

  const rm = data.rms[idx];
  const ok = approveRm(data.token, rm.id);

  check(null, {
    'iteração aprovou RM de fato': () => ok,
  });

  if (!ok) {
    fail(
      `VU ${__VU}: falha ao aprovar ${rm.requestNumber || rm.id} (iterationInTest=${idx})`,
    );
  }

  sleep(0.1);
}
