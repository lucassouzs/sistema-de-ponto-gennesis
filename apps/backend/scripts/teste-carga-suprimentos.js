/**
 * Teste de carga k6 — Materiais / Suprimentos
 *
 * Pré-requisitos:
 *   1. Backend rodando
 *   2. k6 instalado
 *   3. USER_EMAIL e USER_PASSWORD definidos (obrigatório)
 *
 * Gerar exatamente 50 RMs (modo seed — padrão):
 *   k6 run -e USER_EMAIL=... -e USER_PASSWORD=... -e MODE=seed -e ITERATIONS=50 -e VUS=5 scripts/teste-carga-suprimentos.js
 *
 * Carga completa (ramping até 30 VUs):
 *   k6 run -e MODE=load scripts/teste-carga-suprimentos.js
 *
 * Variáveis opcionais:
 *   BASE_URL=http://localhost:5000/api
 *   MATERIAL_ID=cmr0wp8qf000n47fczdmn8ybb
 *   MODE=seed|load          (default: seed)
 *   ITERATIONS=50           (só MODE=seed)
 *   VUS=5                   (só MODE=seed)
 *   COST_CENTER_IDS=id1,id2 (lista fixa; RMs alternam entre os CCs)
 *   USER_EMAIL=...          (obrigatório)
 *   USER_PASSWORD=...       (obrigatório)
 *   LOAD_TEST_ENV=production|local  (opcional; senão detecta via BASE_URL)
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import {
  parseCostCenterIds,
  resolveOsContexts,
  pickOsContext,
  formatOsContextsSummary,
} from './carga-cc-context.js';
import { getUserCredentials, loginJsonBody } from './carga-auth.js';
import { p95, k6SetupTimeout } from './carga-thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const MATERIAL_ID = __ENV.MATERIAL_ID || 'cmr0wp8qf000n47fczdmn8ybb';
const MODE = (__ENV.MODE || 'seed').toLowerCase();
const SEED_ITERATIONS = Number(__ENV.ITERATIONS || 50);
const SEED_VUS = Number(__ENV.VUS || 5);

/** Só incrementa quando POST /material-requests retorna 201 + id. */
const rmCreated = new Counter('rm_created');

const USER = getUserCredentials();

const seedOptions = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    seed_rms: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: SEED_ITERATIONS,
      maxDuration: '10m',
    },
  },
  thresholds: {
    // Exige exatamente N criações bem-sucedidas (não basta o VU ter rodado)
    rm_created: [`count==${SEED_ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{endpoint:create_rm}': [p95(5000, 15000)],
  },
};

const loadOptions = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    suprimentos: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 15 },
        { duration: '1m', target: 30 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    'http_req_duration{endpoint:login}': [p95(2000)],
    'http_req_duration{endpoint:create_rm}': [p95(5000, 15000)],
    'http_req_duration{endpoint:list_rm}': [p95(3000)],
  },
};

export const options = MODE === 'load' ? loadOptions : seedOptions;

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

function login(credentials = USER) {
  const res = http.post(`${BASE_URL}/auth/login`, loginJsonBody(credentials), {
    headers: jsonHeaders(),
    tags: { endpoint: 'login' },
  });

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login retornou token': (r) => !!parseJson(r)?.data?.token,
  });

  if (!ok) return null;
  const body = parseJson(res);
  return {
    token: body.data.token,
    userId: body.data.user?.id,
  };
}

function findCostCenterWithServiceOrder(token) {
  const contexts = resolveOsContexts(token, BASE_URL, jsonHeaders, http);
  return contexts[0] || null;
}

function pickIterationOsContext(osContexts) {
  // seed: __ITER é estável por iteração; load: usa VU para espalhar entre CCs
  const index = MODE === 'seed' ? __ITER : __VU - 1;
  return pickOsContext(osContexts, index);
}

function createMaterialRequest(token, ctx) {
  const payload = {
    costCenterId: ctx.costCenterId,
    serviceOrderId: ctx.serviceOrderId,
    serviceOrder: ctx.serviceOrder,
    obra: `Obra carga k6 VU${__VU}`,
    description: `RM gerada por teste de carga — iter ${__ITER}`,
    priority: 'MEDIUM',
    demandSheet: `FD-K6-${Date.now()}-${__VU}-${__ITER}`,
    demandSheetAttachmentUrl: '/uploads/material-request-items/k6-loadtest.pdf',
    demandSheetAttachmentName: 'k6-loadtest.pdf',
    items: [
      {
        materialId: ctx.materialId,
        quantity: randomIntBetween(1, 20),
        observation: 'Item gerado pelo k6',
      },
    ],
  };

  const res = http.post(`${BASE_URL}/material-requests`, JSON.stringify(payload), {
    headers: jsonHeaders(token),
    tags: { endpoint: 'create_rm' },
  });

  const body = parseJson(res);
  const created =
    res.status === 201 && body?.success === true && !!(body?.data?.id || body?.data?.requestNumber);

  check(res, {
    'create RM status 201': (r) => r.status === 201,
    'create RM success true': () => body?.success === true,
    'create RM retornou id': () => !!(body?.data?.id || body?.data?.requestNumber),
  });

  if (!created) {
    console.error(
      `[create_rm FAIL] VU=${__VU} iter=${__ITER} status=${res.status} body=${res.body}`,
    );
    return null;
  }

  rmCreated.add(1);
  return body.data;
}

function listMaterialRequests(token, userId) {
  const res = http.get(
    `${BASE_URL}/material-requests?requestedBy=${userId}&page=1&limit=10`,
    { headers: jsonHeaders(token), tags: { endpoint: 'list_rm' } },
  );

  check(res, {
    'list RM status 200': (r) => r.status === 200,
    'list RM tem pagination': (r) => !!parseJson(r)?.pagination,
  });
}

/**
 * Em MODE=seed, cada iteração precisa produzir 1 RM.
 * Retenta login/create se falhar (não "gasta" a iteração sem criar).
 */
function createOneRmWithRetries(osCtx, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = login();
    if (!session?.token) {
      console.warn(`VU ${__VU}: login falhou (tentativa ${attempt}/${maxAttempts})`);
      sleep(0.5);
      continue;
    }

    const created = createMaterialRequest(session.token, {
      costCenterId: osCtx.costCenterId,
      serviceOrderId: osCtx.serviceOrderId,
      serviceOrder: osCtx.serviceOrder,
      materialId: MATERIAL_ID,
    });

    if (created) {
      if (MODE !== 'seed') {
        listMaterialRequests(session.token, session.userId);
      }
      return created;
    }

    sleep(0.5);
  }
  return null;
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
    throw new Error(`Falha no login de setup (${USER.email}). Verifique USER_EMAIL e USER_PASSWORD.`);
  }

  const osContexts = resolveOsContexts(session.token, BASE_URL, jsonHeaders, http);
  if (osContexts.length === 0) {
    const hint = parseCostCenterIds().length
      ? 'Verifique COST_CENTER_IDS (IDs inválidos ou sem OS listável).'
      : 'Defina COST_CENTER_IDS com centros de custo reais que tenham OS listável.';
    throw new Error(`Nenhum centro de custo com OS listável. ${hint}`);
  }

  console.log(
    `setup OK — MODE=${MODE} | user=${USER.email} | CCs=${osContexts.length} | ${formatOsContextsSummary(osContexts)}` +
      (MODE === 'seed' ? ` | iterations=${SEED_ITERATIONS} vus=${SEED_VUS}` : ''),
  );

  return { osContexts };
}

export default function (data) {
  const osCtx = pickIterationOsContext(data.osContexts);
  if (!osCtx) {
    fail('Nenhum contexto de OS disponível para esta iteração.');
  }

  if (MODE === 'seed') {
    const created = createOneRmWithRetries(osCtx);
    const ok = check(null, {
      'iteração criou RM de fato': () => !!created,
    });
    if (!ok) {
      fail(
        `VU ${__VU} iter ${__ITER}: não criou RM após retries — abortando para não mentir nas metrics`,
      );
    }
    sleep(randomIntBetween(0, 1));
    return;
  }

  // MODE=load
  const session = login();
  if (!session?.token) {
    sleep(1);
    return;
  }

  const ctx = pickIterationOsContext(data.osContexts);
  if (!ctx) {
    console.warn(`VU ${__VU}: sem contexto de OS — verifique COST_CENTER_IDS`);
    sleep(1);
    return;
  }

  createMaterialRequest(session.token, {
    costCenterId: ctx.costCenterId,
    serviceOrderId: ctx.serviceOrderId,
    serviceOrder: ctx.serviceOrder,
    materialId: MATERIAL_ID,
  });

  listMaterialRequests(session.token, session.userId);
  sleep(randomIntBetween(1, 3));
}
