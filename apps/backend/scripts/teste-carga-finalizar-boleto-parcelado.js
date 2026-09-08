/**

 * Teste de carga k6 — Finalização BOLETO parcelado (após todas parcelas PAID)

 *

 * Pré-requisitos:

 *   1. Backend rodando

 *   2. OCs APPROVED + BOLETO com todas as parcelas PAID
 *      (rode teste-carga-pagamento-oc-boleto-parcelado.js antes)
 *   3. k6 instalado
 *
 * Antes de PENDING_PROOF_VALIDATION, anexa comprovante geral (upload + PATCH payment-proof),
 * igual ao fluxo AVISTA/boleto único — exigido pelo backend após todas as parcelas pagas.

 *

 * Com 10 OCs prontas (2 parcelas):

 *   k6 run -e VUS=3 -e ITERATIONS=10 -e PARCEL_COUNT=2 scripts/teste-carga-finalizar-boleto-parcelado.js

 *

 * Variáveis opcionais:

 *   BASE_URL, VUS, ITERATIONS

 *   PARCEL_COUNT=2

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

const PAYMENT_CONDITION_FILTER = (__ENV.PAYMENT_CONDITION || '').trim();

const USER = getUserCredentials();



const FAKE_PDF_BYTES = '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';



const proofAttached = new Counter('proof_attached');
const nfAttached = new Counter('nf_attached');
const ocFinalized = new Counter('oc_finalized');



export const options = {

  setupTimeout: k6SetupTimeout(),

  scenarios: {

    finalizar_boleto_parcelado: {

      executor: 'shared-iterations',

      vus: Math.min(VUS, ITERATIONS),

      iterations: ITERATIONS,

      maxDuration: '20m',

    },

  },

  thresholds: {
    proof_attached: [`count==${ITERATIONS}`],
    nf_attached: [`count==${ITERATIONS}`],
    oc_finalized: [`count==${ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
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

  if (res.status !== 200 || !token) return null;

  return { token, userId: body.data.user?.id };

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



function fetchOrderDetail(token, ocId) {

  const res = http.get(`${BASE_URL}/purchase-orders/${ocId}`, {

    headers: jsonHeaders(token),

    tags: { endpoint: 'get_oc' },

  });

  const body = parseJson(res);

  if (res.status !== 200 || body?.success !== true) {

    return null;

  }

  return body.data;

}



function fetchReadyForFinalization(token) {

  const res = http.get(`${BASE_URL}/purchase-orders?status=APPROVED&page=1&limit=500`, {

    headers: jsonHeaders(token),

    tags: { endpoint: 'list_approved' },

  });

  const body = parseJson(res);

  if (res.status !== 200) {

    throw new Error(`Listagem APPROVED falhou: status=${res.status} body=${res.body}`);

  }

  const list = Array.isArray(body?.data) ? body.data : [];

  const candidates = list.filter((o) => {

    if (!o?.id) return false;

    if (String(o.paymentType || '').toUpperCase() !== 'BOLETO') return false;

    const n = Number(o.paymentParcelCount ?? 0);

    if (n !== PARCEL_COUNT) return false;

    if (PAYMENT_CONDITION_FILTER && o.paymentCondition !== PAYMENT_CONDITION_FILTER) {

      return false;

    }

    return true;

  });



  const ready = [];

  for (const o of candidates) {
    // Para cedo: setup só precisa de ITERATIONS OCs (evita N GETs sob latência Railway)
    if (ready.length >= ITERATIONS) break;

    const detail = fetchOrderDetail(token, o.id);

    if (!detail) continue;

    const inst = parseStoredInstallments(detail.paymentBoletoInstallments);

    if (!allInstallmentsPaid(inst, PARCEL_COUNT)) continue;

    ready.push({

      id: o.id,

      orderNumber: o.orderNumber,

      createdBy: o.createdBy ?? o.creator?.id ?? null,

    });

  }

  return ready;

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

    [`${tag} -> ${expectedStatus}`]: () => body?.data?.status === expectedStatus,

  });

  if (!ok) {

    console.error(`[${tag} FAIL] ocId=${ocId} status=${res.status} body=${res.body}`);

    return false;

  }

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

    JSON.stringify({ nfUrl: upload.url, nfName: upload.originalName }),

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



function runFinalizationFlow(token, order) {
  const { id } = order;

  const proofUpload = uploadFakePdf(
    token,
    'upload-payment-proof',
    'proof',
    'upload_proof',
  );
  if (!proofUpload) return false;

  if (!attachPaymentProof(token, id, proofUpload)) return false;

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

    !patchStatus(

      token,

      id,

      'PENDING_NF_ATTACHMENT',

      'status_nf_attachment',

      'PENDING_NF_ATTACHMENT',

    )

  ) {

    return false;

  }



  const nfUpload = uploadFakePdf(token, 'upload-nf', 'file', 'upload_nf');

  if (!nfUpload) return false;



  if (!attachNf(token, id, nfUpload)) return false;



  if (!patchStatus(token, id, 'FINALIZED', 'oc_finalize', 'FINALIZED')) {

    return false;

  }



  ocFinalized.add(1);

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



  const ready = fetchReadyForFinalization(session.token);



  console.log(

    `setup — APPROVED+BOLETO+${PARCEL_COUNT}parcelas+todasPAID=${ready.length} | ` +

      `ITERATIONS=${ITERATIONS} | VUS=${Math.min(VUS, ITERATIONS)} | ` +

      `usuário=${USER.email}` +

      (PAYMENT_CONDITION_FILTER ? ` | paymentCondition=${PAYMENT_CONDITION_FILTER}` : ''),

  );



  if (ready.length === 0) {

    throw new Error(

      `Nenhuma OC APPROVED BOLETO com ${PARCEL_COUNT} parcela(s) e todas PAID. ` +

        'Rode teste-carga-pagamento-oc-boleto-parcelado.js antes.',

    );

  }



  if (ready.length < ITERATIONS) {

    throw new Error(

      `Só há ${ready.length} OC(s) prontas para finalizar, mas ITERATIONS=${ITERATIONS}.`,

    );

  }



  const mismatched = ready.filter((o) => o.createdBy && o.createdBy !== session.userId);

  if (mismatched.length > 0) {

    console.warn(

      `${mismatched.length} OC(s) não criadas por ${USER.email}; anexo de NF/finalização pode falhar.`,

    );

  }



  return {

    token: session.token,

    orders: ready.slice(0, ITERATIONS),

  };

}



export default function (data) {

  const idx = exec.scenario.iterationInTest;

  if (idx < 0 || idx >= data.orders.length) {

    fail(`Índice inválido iterationInTest=${idx}`);

  }



  const order = data.orders[idx];

  const ok = runFinalizationFlow(data.token, order);



  check(null, {

    'iteração finalizou OC boleto parcelado': () => ok,

  });



  if (!ok) {

    fail(

      `VU ${__VU}: falha na finalização da OC ${order.orderNumber || order.id} (idx=${idx})`,

    );

  }



  sleep(0.1);

}


