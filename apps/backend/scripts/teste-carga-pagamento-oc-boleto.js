/**
 * Teste de carga k6 — Pagamento BOLETO parcela única (APPROVED → FINALIZED)
 *
 * Pré-requisitos:
 *   1. Backend rodando (padrão: http://localhost:5000)
 *   2. teste1@loadtest.com autenticável (criador das OCs)
 *   3. OCs com status=APPROVED e paymentType=BOLETO
 *      (ex.: teste-carga-cotacao-boleto.js + teste-carga-aprovacao-oc.js)
 *   4. k6 instalado
 *
 * Com 20 OCs APPROVED (BOLETO):
 *   k6 run -e VUS=5 -e ITERATIONS=20 scripts/teste-carga-pagamento-oc-boleto.js
 *
 * Uma OC distinta por iteração (shared-iterations).
 *
 * Variáveis opcionais:
 *   BASE_URL=http://localhost:5000/api
 *   VUS=5
 *   ITERATIONS=20
 *   USER.email=teste1@loadtest.com
 *   USER_PASSWORD=Teste123!
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

import { getUserCredentials, loginJsonBody } from './carga-auth.js';
import { p95, k6SetupTimeout } from './carga-thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const VUS = Math.max(1, Number(__ENV.VUS || 5));
const ITERATIONS = Math.max(1, Number(__ENV.ITERATIONS || 20));
const USER = getUserCredentials();

/** PDF mínimo válido em memória (k6 http.file). */
const FAKE_PDF_BYTES = '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';

const boletoUploaded = new Counter('boleto_uploaded');
const boletoAttached = new Counter('boleto_attached');
const phaseReleased = new Counter('phase_released');
const financialControlCreated = new Counter('financial_control_created');
const proofAttached = new Counter('proof_attached');
const nfAttached = new Counter('nf_attached');
const ocFinalized = new Counter('oc_finalized');

export const options = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    pagamento_boleto: {
      executor: 'shared-iterations',
      vus: Math.min(VUS, ITERATIONS),
      iterations: ITERATIONS,
      maxDuration: '30m',
    },
  },
  thresholds: {
    boleto_uploaded: [`count==${ITERATIONS}`],
    boleto_attached: [`count==${ITERATIONS}`],
    phase_released: [`count==${ITERATIONS}`],
    financial_control_created: [`count==${ITERATIONS}`],
    proof_attached: [`count==${ITERATIONS}`],
    nf_attached: [`count==${ITERATIONS}`],
    oc_finalized: [`count==${ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{endpoint:upload_boleto}': [p95(8000, 15000)],
    'http_req_duration{endpoint:financial_control_create}': [p95(5000, 15000)],
    'http_req_duration{endpoint:upload_proof}': [p95(8000, 15000)],
    'http_req_duration{endpoint:upload_nf}': [p95(8000, 15000)],
    'http_req_duration{endpoint:oc_finalize}': [p95(5000, 15000)],
  },
};

function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
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
  if (res.status !== 200 || !token) {
    return null;
  }
  return { token, userId: body.data.user?.id };
}

function fetchApprovedBoletoOrders(token) {
  const res = http.get(`${BASE_URL}/purchase-orders?status=APPROVED&page=1&limit=500`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'list_approved' },
  });
  const body = parseJson(res);
  if (res.status !== 200) {
    throw new Error(`Listagem APPROVED falhou: status=${res.status} body=${res.body}`);
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  return list
    .filter((o) => o?.id && String(o.paymentType || '').toUpperCase() === 'BOLETO')
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      paymentType: o.paymentType,
      status: o.status,
      createdBy: o.createdBy ?? o.creator?.id ?? null,
    }));
}

function uploadFakePdf(token, endpoint, fieldName, tag) {
  const res = http.post(
    `${BASE_URL}/purchase-orders/${endpoint}`,
    {
      [fieldName]: http.file(FAKE_PDF_BYTES, `k6-${tag}.pdf`, 'application/pdf'),
    },
    { headers: authHeaders(token), tags: { endpoint: tag } },
  );
  const body = parseJson(res);
  const url = body?.data?.url;
  const originalName = body?.data?.originalName;
  const ok = res.status === 200 && body?.success === true && !!url;
  check(res, {
    [`${tag} status 200`]: (r) => r.status === 200,
    [`${tag} retorna url`]: () => !!url,
  });
  if (!ok) {
    console.error(`[${tag} FAIL] status=${res.status} body=${res.body}`);
    return null;
  }
  return { url, originalName: originalName || `k6-${tag}.pdf` };
}

function patchStatus(token, ocId, nextStatus, tag, expectedStatus) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/status`,
    JSON.stringify({ status: nextStatus }),
    { headers: jsonHeaders(token), tags: { endpoint: tag } },
  );
  const body = parseJson(res);
  const ok =
    res.status === 200 &&
    body?.success === true &&
    body?.data?.status === expectedStatus;
  check(res, {
    [`${tag} status 200`]: (r) => r.status === 200,
    [`${tag} success`]: () => body?.success === true,
    [`${tag} -> ${expectedStatus}`]: () => body?.data?.status === expectedStatus,
  });
  if (!ok) {
    console.error(
      `[${tag} FAIL] ocId=${ocId} status=${res.status} body=${res.body}`,
    );
    return false;
  }
  return true;
}

function attachPaymentBoleto(token, ocId, upload) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/payment-boleto`,
    JSON.stringify({
      paymentBoletoUrl: upload.url,
      paymentBoletoName: upload.originalName,
    }),
    { headers: jsonHeaders(token), tags: { endpoint: 'attach_boleto' } },
  );
  const body = parseJson(res);
  const ok =
    res.status === 200 &&
    body?.success === true &&
    !!(body?.data?.paymentBoletoUrl || '').trim();
  check(res, {
    'attach_boleto status 200': (r) => r.status === 200,
    'attach_boleto success': () => body?.success === true,
    'attach_boleto url salva': () => !!(body?.data?.paymentBoletoUrl || '').trim(),
  });
  if (!ok) {
    console.error(`[attach_boleto FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  boletoAttached.add(1);
  return true;
}

function releasePaymentPhase(token, ocId) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/release-payment-boleto-phase`,
    null,
    { headers: jsonHeaders(token), tags: { endpoint: 'release_phase' } },
  );
  const body = parseJson(res);
  const ok =
    res.status === 200 &&
    body?.success === true &&
    body?.data?.paymentBoletoPhaseReleased === true;
  check(res, {
    'release_phase status 200': (r) => r.status === 200,
    'release_phase success': () => body?.success === true,
    'release_phase liberada': () => body?.data?.paymentBoletoPhaseReleased === true,
  });
  if (!ok) {
    console.error(`[release_phase FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  phaseReleased.add(1);
  return true;
}

function createFinancialControl(token, orderNumber, paymentMonth, paymentYear) {
  const res = http.post(
    `${BASE_URL}/financial-control`,
    JSON.stringify({
      paymentMonth,
      paymentYear,
      status: 'AGUARDAR_NOTA',
      ocNumber: orderNumber,
    }),
    { headers: jsonHeaders(token), tags: { endpoint: 'financial_control_create' } },
  );
  const body = parseJson(res);
  const ok = res.status === 201 && body?.success === true && !!body?.data?.id;
  check(res, {
    'financial_control status 201': (r) => r.status === 201,
    'financial_control success': () => body?.success === true,
    'financial_control tem id': () => !!body?.data?.id,
  });
  if (!ok) {
    console.error(
      `[financial_control FAIL] oc=${orderNumber} status=${res.status} body=${res.body}`,
    );
    return false;
  }
  financialControlCreated.add(1);
  return true;
}

function attachPaymentProof(token, ocId, upload) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/payment-proof`,
    JSON.stringify({
      paymentProofUrl: upload.url,
      paymentProofName: upload.originalName,
    }),
    { headers: jsonHeaders(token), tags: { endpoint: 'attach_proof' } },
  );
  const body = parseJson(res);
  const ok =
    res.status === 200 &&
    body?.success === true &&
    !!(body?.data?.paymentProofUrl || '').trim();
  check(res, {
    'attach_proof status 200': (r) => r.status === 200,
    'attach_proof success': () => body?.success === true,
    'attach_proof url salva': () => !!(body?.data?.paymentProofUrl || '').trim(),
  });
  if (!ok) {
    console.error(`[attach_proof FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  proofAttached.add(1);
  return true;
}

function attachNf(token, ocId, upload) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/nf-attachments`,
    JSON.stringify({
      nfUrl: upload.url,
      nfName: upload.originalName,
    }),
    { headers: jsonHeaders(token), tags: { endpoint: 'attach_nf' } },
  );
  const body = parseJson(res);
  const nfs = Array.isArray(body?.data?.nfAttachments) ? body.data.nfAttachments : [];
  const ok = res.status === 200 && body?.success === true && nfs.length > 0;
  check(res, {
    'attach_nf status 200': (r) => r.status === 200,
    'attach_nf success': () => body?.success === true,
    'attach_nf lista preenchida': () => nfs.length > 0,
  });
  if (!ok) {
    console.error(`[attach_nf FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  nfAttached.add(1);
  return true;
}

function runBoletoPaymentFlow(token, order, paymentMonth, paymentYear) {
  const { id, orderNumber } = order;

  const boletoUpload = uploadFakePdf(token, 'upload-boleto', 'boleto', 'upload_boleto');
  if (!boletoUpload) {
    return false;
  }
  boletoUploaded.add(1);

  if (!attachPaymentBoleto(token, id, boletoUpload)) {
    return false;
  }

  if (!releasePaymentPhase(token, id)) {
    return false;
  }

  if (!createFinancialControl(token, orderNumber, paymentMonth, paymentYear)) {
    return false;
  }

  const proofUpload = uploadFakePdf(token, 'upload-payment-proof', 'proof', 'upload_proof');
  if (!proofUpload) {
    return false;
  }

  if (!attachPaymentProof(token, id, proofUpload)) {
    return false;
  }

  if (
    !patchStatus(
      token,
      id,
      'PENDING_PROOF_VALIDATION',
      'status_proof_validation',
      'PENDING_PROOF_VALIDATION',
    )
  ) {
    return false;
  }

  if (
    !patchStatus(token, id, 'PENDING_NF_ATTACHMENT', 'status_nf_attachment', 'PENDING_NF_ATTACHMENT')
  ) {
    return false;
  }

  const nfUpload = uploadFakePdf(token, 'upload-nf', 'file', 'upload_nf');
  if (!nfUpload) {
    return false;
  }

  if (!attachNf(token, id, nfUpload)) {
    return false;
  }

  if (!patchStatus(token, id, 'FINALIZED', 'oc_finalize', 'FINALIZED')) {
    return false;
  }

  ocFinalized.add(1);
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
    throw new Error(
      `Login falhou (${USER.email}). Confira senha e rode: npx tsx scripts/criar-usuarios-teste.ts`,
    );
  }

  const approved = fetchApprovedBoletoOrders(session.token);
  const now = new Date();
  const paymentMonth = now.getMonth() + 1;
  const paymentYear = now.getFullYear();

  console.log(
    `setup — APPROVED+BOLETO=${approved.length} | ITERATIONS=${ITERATIONS} | ` +
      `VUS=${Math.min(VUS, ITERATIONS)} | usuário=${USER.email} | ` +
      `lançamento=${paymentMonth}/${paymentYear}`,
  );

  if (approved.length === 0) {
    throw new Error(
      'Nenhuma OC APPROVED com paymentType=BOLETO. Rode cotação boleto + aprovação antes.',
    );
  }

  if (approved.length < ITERATIONS) {
    throw new Error(
      `Só há ${approved.length} OC(s) APPROVED+BOLETO, mas ITERATIONS=${ITERATIONS}. ` +
        `Ajuste -e ITERATIONS=${approved.length} ou gere mais OCs.`,
    );
  }

  const mismatchedCreator = approved.filter(
    (o) => o.createdBy && o.createdBy !== session.userId,
  );
  if (mismatchedCreator.length > 0) {
    console.warn(
      `${mismatchedCreator.length} OC(s) APPROVED+BOLETO não foram criadas por ${USER.email}; ` +
        'anexo de NF/finalização pode falhar (exige createdBy).',
    );
  }

  if (approved.length > ITERATIONS) {
    console.warn(
      `Há ${approved.length} elegíveis; vamos processar só as primeiras ${ITERATIONS} (ordem da API).`,
    );
  }

  const orders = approved.slice(0, ITERATIONS);

  return {
    token: session.token,
    userId: session.userId,
    orders,
    paymentMonth,
    paymentYear,
  };
}

export default function (data) {
  const idx = exec.scenario.iterationInTest;
  if (idx < 0 || idx >= data.orders.length) {
    fail(`Índice inválido iterationInTest=${idx} (orders=${data.orders.length})`);
  }

  const order = data.orders[idx];
  const ok = runBoletoPaymentFlow(
    data.token,
    order,
    data.paymentMonth,
    data.paymentYear,
  );

  check(null, {
    'iteração finalizou OC boleto de fato': () => ok,
  });

  if (!ok) {
    fail(
      `VU ${__VU}: falha no pagamento BOLETO da OC ${order.orderNumber || order.id} (iterationInTest=${idx})`,
    );
  }

  sleep(0.1);
}
