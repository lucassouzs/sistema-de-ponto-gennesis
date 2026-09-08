/**
 * Teste de carga k6 — Pagamento BOLETO parcelado (ciclo de parcelas apenas)
 *
 * Executa o ciclo sequencial de cada parcela e PARA com a OC em APPROVED
 * e todas as parcelas PAID. Não envia para validação/NF/FINALIZED.
 *
 * Para finalizar depois, rode manualmente:
 *   scripts/teste-carga-finalizar-boleto-parcelado.js
 *
 * Pré-requisitos:
 *   1. Backend rodando
 *   2. OCs APPROVED + BOLETO com paymentParcelCount = PARCEL_COUNT
 *      (ex.: teste-carga-cotacao-boleto-parcelado.js + aprovação OC)
 *   3. k6 instalado
 *
 * Com 10 OCs APPROVED (2 parcelas):
 *   k6 run -e VUS=3 -e ITERATIONS=10 -e PARCEL_COUNT=2 scripts/teste-carga-pagamento-oc-boleto-parcelado.js
 *
 * Variáveis opcionais:
 *   BASE_URL, VUS, ITERATIONS
 *   PARCEL_COUNT=2
 *   PARCEL_DUE_DAYS=30,60
 *   PAYMENT_CONDITION — filtra OCs por paymentCondition (opcional)
 *   USER.email, USER_PASSWORD
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { getUserCredentials, loginJsonBody } from './carga-auth.js';
import { p95, k6SetupTimeout } from './carga-thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const VUS = Math.max(1, Number(__ENV.VUS || 3));
const ITERATIONS = Math.max(1, Number(__ENV.ITERATIONS || 10));
const PARCEL_COUNT = Math.max(2, Number(__ENV.PARCEL_COUNT || 2));
const PARCEL_DUE_DAYS = parseParcelDueDays(__ENV.PARCEL_DUE_DAYS || '30,60');
const PAYMENT_CONDITION_FILTER = (__ENV.PAYMENT_CONDITION || '').trim();
const USER = getUserCredentials();

const FAKE_PDF_BYTES = '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';

const installmentBoletoUploaded = new Counter('installment_boleto_uploaded');
const installmentPaid = new Counter('installment_paid');
const ocAllInstallmentsPaid = new Counter('oc_all_installments_paid');
const financialControlCreated = new Counter('financial_control_created');

const expectedInstallmentOps = ITERATIONS * PARCEL_COUNT;

export const options = {
  setupTimeout: k6SetupTimeout(),
  scenarios: {
    pagamento_boleto_parcelado: {
      executor: 'shared-iterations',
      vus: Math.min(VUS, ITERATIONS),
      iterations: ITERATIONS,
      maxDuration: '45m',
    },
  },
  thresholds: {
    installment_boleto_uploaded: [`count==${expectedInstallmentOps}`],
    installment_paid: [`count==${expectedInstallmentOps}`],
    oc_all_installments_paid: [`count==${ITERATIONS}`],
    financial_control_created: [`count==${ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{endpoint:upload_boleto}': [p95(8000, 15000)],
    'http_req_duration{endpoint:save_installments}': [p95(5000, 15000)],
  },
};

function parseParcelDueDays(raw) {
  const parts = String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (parts.length !== PARCEL_COUNT) {
    throw new Error(
      `PARCEL_DUE_DAYS deve ter ${PARCEL_COUNT} valor(es); recebido: "${raw}"`,
    );
  }
  return parts;
}

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

function ymdAddDays(baseYmd, addDays) {
  const raw = String(baseYmd || '').trim();
  const base = raw.includes('T') ? raw : `${raw.slice(0, 10)}T12:00:00`;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + addDays);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
}

function splitAmountInInstallments(total, n) {
  const cents = Math.round(total * 100);
  const q = Math.floor(cents / n);
  const r = cents % n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = q + (i === n - 1 ? r : 0);
    out.push(c / 100);
  }
  return out;
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

function fetchApprovedParcelOrders(token) {
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
    .filter((o) => {
      if (!o?.id) return false;
      if (String(o.paymentType || '').toUpperCase() !== 'BOLETO') return false;
      const n = Number(o.paymentParcelCount ?? 0);
      if (n !== PARCEL_COUNT) return false;
      if (PAYMENT_CONDITION_FILTER && o.paymentCondition !== PAYMENT_CONDITION_FILTER) {
        return false;
      }
      return true;
    })
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      amountToPay: Number(o.amountToPay),
      paymentCondition: o.paymentCondition,
      paymentParcelCount: Number(o.paymentParcelCount ?? PARCEL_COUNT),
      paymentParcelDueDays: Array.isArray(o.paymentParcelDueDays)
        ? o.paymentParcelDueDays.map((x) => Number(x))
        : PARCEL_DUE_DAYS,
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
  if (!ok) {
    console.error(`[${tag} FAIL] status=${res.status} body=${res.body}`);
    return null;
  }
  return { url, originalName: originalName || `k6-${tag}.pdf` };
}

function buildInstallmentsPayload(order, activeIndex, boletoUpload) {
  const total = Number.isFinite(order.amountToPay) ? order.amountToPay : 0;
  const amounts = splitAmountInInstallments(total, PARCEL_COUNT);
  const dueDays =
    order.paymentParcelDueDays?.length === PARCEL_COUNT
      ? order.paymentParcelDueDays
      : PARCEL_DUE_DAYS;
  const baseDate = order.orderDate || new Date().toISOString();

  const installments = [];
  for (let i = 0; i < PARCEL_COUNT; i++) {
    const row = {
      amount: amounts[i],
      dueDate: ymdAddDays(baseDate, dueDays[i] ?? dueDays[dueDays.length - 1] ?? 30),
      boletoUrl: null,
      boletoName: null,
    };
    if (i === activeIndex && boletoUpload) {
      row.boletoUrl = boletoUpload.url;
      row.boletoName = boletoUpload.originalName;
    }
    installments.push(row);
  }
  return installments;
}

function saveInstallments(token, ocId, installments) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/payment-boleto-installments`,
    JSON.stringify({ installments }),
    { headers: jsonHeaders(token), tags: { endpoint: 'save_installments' } },
  );
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true;
  check(res, {
    'save_installments status 200': (r) => r.status === 200,
    'save_installments success': () => body?.success === true,
  });
  if (!ok) {
    console.error(`[save_installments FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  return true;
}

function releasePaymentPhase(token, ocId) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/release-payment-boleto-phase`,
    null,
    { headers: jsonHeaders(token), tags: { endpoint: 'release_phase' } },
  );
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true && body?.data?.paymentBoletoPhaseReleased === true;
  check(res, {
    'release_phase status 200': (r) => r.status === 200,
    'release_phase success': () => body?.success === true,
    'release_phase liberada': () => body?.data?.paymentBoletoPhaseReleased === true,
  });
  if (!ok) {
    console.error(`[release_phase FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
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

function parseStoredInstallments(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((x) => ({
    paymentStatus:
      x?.paymentStatus === 'PAID' ||
      x?.paymentStatus === 'AWAITING_PAYMENT' ||
      x?.paymentStatus === 'PENDING_BOLETO'
        ? x.paymentStatus
        : 'PENDING_BOLETO',
  }));
}

function allInstallmentsPaid(inst, parcelCount) {
  if (inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (inst[i]?.paymentStatus !== 'PAID') return false;
  }
  return true;
}

function verifyAllInstallmentsPaid(token, ocId, parcelCount) {
  const res = http.get(`${BASE_URL}/purchase-orders/${ocId}`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'get_oc' },
  });
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true;
  if (!ok) {
    console.error(`[get_oc FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  const inst = parseStoredInstallments(body?.data?.paymentBoletoInstallments);
  const paid = allInstallmentsPaid(inst, parcelCount);
  const stillApproved = String(body?.data?.status || '') === 'APPROVED';
  check(null, {
    'OC permanece APPROVED': () => stillApproved,
    'todas parcelas PAID': () => paid,
  });
  if (!paid || !stillApproved) {
    console.error(
      `[verify_paid FAIL] ocId=${ocId} status=${body?.data?.status} ` +
        `parcelas=${JSON.stringify(inst)}`,
    );
    return false;
  }
  return true;
}

function attachInstallmentProof(token, ocId, upload, installmentIndex) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/payment-boleto-installment-proof`,
    JSON.stringify({
      paymentProofUrl: upload.url,
      paymentProofName: upload.originalName,
      installmentIndex,
    }),
    { headers: jsonHeaders(token), tags: { endpoint: 'installment_proof' } },
  );
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true;
  check(res, {
    'installment_proof status 200': (r) => r.status === 200,
    'installment_proof success': () => body?.success === true,
  });
  if (!ok) {
    console.error(
      `[installment_proof FAIL] ocId=${ocId} idx=${installmentIndex} ` +
        `status=${res.status} body=${res.body}`,
    );
    return false;
  }
  return true;
}

function returnAfterInstallmentPaid(token, ocId) {
  const res = http.patch(
    `${BASE_URL}/purchase-orders/${ocId}/return-after-boleto-installment-paid`,
    null,
    { headers: jsonHeaders(token), tags: { endpoint: 'installment_return' } },
  );
  const body = parseJson(res);
  const ok = res.status === 200 && body?.success === true;
  check(res, {
    'installment_return status 200': (r) => r.status === 200,
    'installment_return success': () => body?.success === true,
  });
  if (!ok) {
    console.error(`[installment_return FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);
    return false;
  }
  return true;
}

function runParcelCycle(token, order, paymentMonth, paymentYear) {
  const { id, orderNumber } = order;

  for (let i = 0; i < PARCEL_COUNT; i++) {
    const boletoUpload = uploadFakePdf(
      token,
      'upload-boleto',
      'boleto',
      `upload_boleto_p${i}`,
    );
    if (!boletoUpload) return false;
    installmentBoletoUploaded.add(1);

    const installments = buildInstallmentsPayload(order, i, boletoUpload);
    if (!saveInstallments(token, id, installments)) return false;

    if (!releasePaymentPhase(token, id)) return false;

    if (i === 0) {
      if (!createFinancialControl(token, orderNumber, paymentMonth, paymentYear)) {
        return false;
      }
    }

    const proofUpload = uploadFakePdf(
      token,
      'upload-payment-proof',
      'proof',
      `upload_proof_p${i}`,
    );
    if (!proofUpload) return false;

    if (!attachInstallmentProof(token, id, proofUpload, i)) return false;

    if (!returnAfterInstallmentPaid(token, id)) return false;
    installmentPaid.add(1);
  }

  if (!verifyAllInstallmentsPaid(token, id, PARCEL_COUNT)) {
    return false;
  }

  ocAllInstallmentsPaid.add(1);
  return true;
}

export function setup() {
  const health = http.get(`${BASE_URL.replace(/\/api$/, '')}/health`);
  if (health.status !== 200) {
    throw new Error(`Backend indisponível em ${BASE_URL}.`);
  }

  const session = login();
  if (!session?.token) {
    throw new Error(`Login falhou (${USER.email}).`);
  }

  const approved = fetchApprovedParcelOrders(session.token);
  const now = new Date();
  const paymentMonth = now.getMonth() + 1;
  const paymentYear = now.getFullYear();

  console.log(
    `setup — APPROVED+BOLETO+${PARCEL_COUNT}parcelas=${approved.length} | ` +
      `ITERATIONS=${ITERATIONS} | VUS=${Math.min(VUS, ITERATIONS)} | ` +
      `usuário=${USER.email} | prazos=[${PARCEL_DUE_DAYS.join(',')}]` +
      (PAYMENT_CONDITION_FILTER ? ` | paymentCondition=${PAYMENT_CONDITION_FILTER}` : ''),
  );

  if (approved.length === 0) {
    throw new Error(
      `Nenhuma OC APPROVED BOLETO com ${PARCEL_COUNT} parcela(s). ` +
        'Rode teste-carga-cotacao-boleto-parcelado.js + aprovação OC antes.',
    );
  }

  if (approved.length < ITERATIONS) {
    throw new Error(
      `Só há ${approved.length} OC(s) elegíveis, mas ITERATIONS=${ITERATIONS}.`,
    );
  }

  const mismatched = approved.filter(
    (o) => o.createdBy && o.createdBy !== session.userId,
  );
  if (mismatched.length > 0) {
    console.warn(
      `${mismatched.length} OC(s) não criadas por ${USER.email}; NF/finalização pode falhar.`,
    );
  }

  return {
    token: session.token,
    orders: approved.slice(0, ITERATIONS),
    paymentMonth,
    paymentYear,
  };
}

export default function (data) {
  const idx = exec.scenario.iterationInTest;
  if (idx < 0 || idx >= data.orders.length) {
    fail(`Índice inválido iterationInTest=${idx}`);
  }

  const order = data.orders[idx];
  const ok = runParcelCycle(data.token, order, data.paymentMonth, data.paymentYear);

  check(null, {
    'iteração concluiu ciclo de parcelas': () => ok,
  });

  if (!ok) {
    fail(
      `VU ${__VU}: falha no ciclo de parcelas da OC ${order.orderNumber || order.id} (idx=${idx})`,
    );
  }

  sleep(0.1);
}
