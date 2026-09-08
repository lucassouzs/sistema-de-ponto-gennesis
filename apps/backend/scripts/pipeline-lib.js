/**
 * Utilitários compartilhados pelos pipelines de teste de carga k6.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = __dirname;

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.PIPELINE_FETCH_TIMEOUT_MS || 30000);
const DEFAULT_VERIFY_RETRIES = Number(process.env.PIPELINE_VERIFY_RETRIES || 5);
const DEFAULT_VERIFY_RETRY_DELAY_MS = Number(process.env.PIPELINE_VERIFY_RETRY_DELAY_MS || 800);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Evita fetch para ::1 quando o backend só escuta em IPv4 (comum no Windows). */
function normalizeApiUrl(url) {
  return String(url).replace(/\/\/localhost\b/i, '//127.0.0.1').replace(/\/$/, '');
}

function formatFetchError(err, context) {
  const parts = [context];
  if (err?.name) parts.push(`tipo=${err.name}`);
  if (err?.message) parts.push(`mensagem=${err.message}`);

  const cause = err?.cause;
  if (cause) {
    if (cause.code) parts.push(`codigo=${cause.code}`);
    if (cause.errno !== undefined) parts.push(`errno=${cause.errno}`);
    if (cause.syscall) parts.push(`syscall=${cause.syscall}`);
    if (cause.address) parts.push(`endereco=${cause.address}`);
    if (cause.port) parts.push(`porta=${cause.port}`);
    if (!cause.code && cause.message) parts.push(`cause=${cause.message}`);
  }

  if (err?.name === 'AbortError') {
    parts.push(`timeout=${DEFAULT_FETCH_TIMEOUT_MS}ms`);
  }

  return parts.join(' | ');
}

async function fetchWithDetails(url, options = {}, context = 'fetch') {
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  const { timeoutMs: _drop, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    throw new Error(`${formatFetchError(err, context)} | url=${url}`);
  } finally {
    clearTimeout(timer);
  }
}

function parseArgv(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      out[raw.slice(2)] = true;
    } else {
      out[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return out;
}

function parseConfig({
  defaultIterations,
  defaultVus,
  defaultParcelCount = 2,
  defaultPaymentVus,
}) {
  const argv = parseArgv(process.argv.slice(2));
  const iterations = Math.max(
    1,
    Number(argv.iterations ?? process.env.ITERATIONS ?? defaultIterations),
  );
  const vus = Math.max(1, Number(argv.vus ?? process.env.VUS ?? defaultVus));
  const parcelCount = Math.max(
    2,
    Number(argv['parcel-count'] ?? process.env.PARCEL_COUNT ?? defaultParcelCount),
  );
  const paymentVus = Math.max(
    1,
    Number(
      argv['payment-vus'] ??
        process.env.PAYMENT_VUS ??
        defaultPaymentVus ??
        Math.min(vus, 3),
    ),
  );
  const baseUrl = normalizeApiUrl(
    argv['base-url'] ?? process.env.BASE_URL ?? 'http://localhost:5000/api',
  );
  const costCenterIds = String(
    argv['cost-center-ids'] ?? process.env.COST_CENTER_IDS ?? '',
  ).trim();
  const userEmail = String(argv['user-email'] ?? process.env.USER_EMAIL ?? '').trim();
  const userPassword = String(argv['user-password'] ?? process.env.USER_PASSWORD ?? '').trim();
  if (!userEmail || !userPassword) {
    throw new Error(
      'Defina USER_EMAIL e USER_PASSWORD (variáveis de ambiente ou --user-email=... --user-password=...). ' +
        'Não há usuário de teste padrão — os usuários @loadtest.com foram removidos de produção.',
    );
  }
  const k6Bin = process.env.K6_BIN || null;

  return {
    iterations,
    vus,
    parcelCount,
    paymentVus,
    baseUrl,
    costCenterIds,
    userEmail,
    userPassword,
    k6Bin,
  };
}

function resolveK6(explicitBin) {
  const candidates = [];
  if (explicitBin) candidates.push(explicitBin);
  candidates.push('k6');
  if (process.platform === 'win32') {
    candidates.push('C:\\Program Files\\k6\\k6.exe');
  }

  for (const bin of candidates) {
    try {
      const probe = spawnSync(bin, ['version'], {
        encoding: 'utf8',
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (probe.status === 0) {
        return bin;
      }
    } catch {
      // tenta próximo candidato
    }
  }

  throw new Error(
    'k6 não encontrado no PATH. Instale em https://k6.io/docs/get-started/installation/ ' +
      'ou defina K6_BIN com o caminho do executável.',
  );
}

async function healthCheck(baseUrl) {
  const root = baseUrl.replace(/\/api$/, '');
  try {
    const res = await fetchWithDetails(
      `${root}/health`,
      { method: 'GET' },
      'healthCheck GET /health',
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    throw new Error(
      `Backend indisponível em ${root}/health. ${err.message}. Suba o servidor antes do pipeline.`,
    );
  }
}

async function apiLogin(config) {
  const url = `${config.baseUrl}/auth/login`;
  const res = await fetchWithDetails(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.userEmail,
        password: config.userPassword,
      }),
    },
    `apiLogin POST ${url}`,
  );
  const body = await res.json().catch(() => null);
  const token = body?.data?.token;
  if (!res.ok || !token) {
    const snippet = body?.message ? ` — ${body.message}` : '';
    throw new Error(`Login falhou (${config.userEmail}): HTTP ${res.status}${snippet}`);
  }
  return token;
}

async function countMaterialRequests(token, baseUrl, status) {
  const url = `${baseUrl}/material-requests?status=${encodeURIComponent(status)}&page=1&limit=1`;
  const res = await fetchWithDetails(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    `countMaterialRequests GET status=${status}`,
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const snippet = body?.message ? ` — ${body.message}` : '';
    throw new Error(`Listagem RM status=${status} falhou: HTTP ${res.status}${snippet} | url=${url}`);
  }
  return Number(body?.pagination?.total ?? (Array.isArray(body?.data) ? body.data.length : 0));
}

async function countPurchaseOrders(token, baseUrl, status) {
  const url = `${baseUrl}/purchase-orders?status=${encodeURIComponent(status)}&page=1&limit=1`;
  const res = await fetchWithDetails(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    `countPurchaseOrders GET status=${status}`,
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const snippet = body?.message ? ` — ${body.message}` : '';
    throw new Error(`Listagem OC status=${status} falhou: HTTP ${res.status}${snippet} | url=${url}`);
  }
  return Number(body?.pagination?.total ?? (Array.isArray(body?.data) ? body.data.length : 0));
}

function parseStoredInstallments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => ({
    paymentStatus: ['PAID', 'AWAITING_PAYMENT', 'PENDING_BOLETO'].includes(x?.paymentStatus)
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

async function countParcelOrdersAllPaid(token, baseUrl, parcelCount, paymentType = 'BOLETO') {
  const listUrl = `${baseUrl}/purchase-orders?status=APPROVED&page=1&limit=500`;
  const res = await fetchWithDetails(
    listUrl,
    { headers: { Authorization: `Bearer ${token}` } },
    'countParcelOrdersAllPaid GET APPROVED',
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const snippet = body?.message ? ` — ${body.message}` : '';
    throw new Error(`Listagem OC APPROVED falhou: HTTP ${res.status}${snippet} | url=${listUrl}`);
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  let ready = 0;
  for (const o of list) {
    if (!o?.id) continue;
    if (String(o.paymentType || '').toUpperCase() !== paymentType.toUpperCase()) continue;
    if (Number(o.paymentParcelCount ?? 0) !== parcelCount) continue;
    const detailUrl = `${baseUrl}/purchase-orders/${o.id}`;
    const detailRes = await fetchWithDetails(
      detailUrl,
      { headers: { Authorization: `Bearer ${token}` } },
      `countParcelOrdersAllPaid GET ${o.orderNumber || o.id}`,
    );
    const detail = await detailRes.json().catch(() => null);
    if (!detailRes.ok || !detail?.data) continue;
    const inst = parseStoredInstallments(detail.data.paymentBoletoInstallments);
    if (allInstallmentsPaid(inst, parcelCount)) ready += 1;
  }
  return ready;
}

async function snapshotCounts(config) {
  const token = await apiLogin(config);
  const [pendingRm, approvedRm, pendingComprasOc, approvedOc, finalizedOc] = await Promise.all([
    countMaterialRequests(token, config.baseUrl, 'PENDING'),
    countMaterialRequests(token, config.baseUrl, 'APPROVED'),
    countPurchaseOrders(token, config.baseUrl, 'PENDING_COMPRAS'),
    countPurchaseOrders(token, config.baseUrl, 'APPROVED'),
    countPurchaseOrders(token, config.baseUrl, 'FINALIZED'),
  ]);
  const parcelAllPaid = await countParcelOrdersAllPaid(
    token,
    config.baseUrl,
    config.parcelCount,
    'BOLETO',
  );
  return {
    token,
    pendingRm,
    approvedRm,
    pendingComprasOc,
    approvedOc,
    finalizedOc,
    parcelAllPaid,
  };
}

/**
 * Aguarda o backend estabilizar após k6 e tenta snapshot com retry.
 * Evita race condition: k6 terminou mas API ainda não responde/contabilizou.
 */
async function snapshotCountsWithRetry(config, options = {}) {
  const {
    label = 'verificação pós-k6',
    retries = DEFAULT_VERIFY_RETRIES,
    delayMs = DEFAULT_VERIFY_RETRY_DELAY_MS,
    initialDelayMs = delayMs,
  } = options;

  if (initialDelayMs > 0) {
    console.log(
      `  Aguardando ${initialDelayMs}ms antes da ${label} (backend processar últimas requisições do k6)...`,
    );
    await sleep(initialDelayMs);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const snapshot = await snapshotCounts(config);
      if (attempt > 1) {
        console.log(`  ${label}: snapshot OK na tentativa ${attempt}/${retries}`);
      }
      return snapshot;
    } catch (err) {
      lastError = err;
      const isLast = attempt === retries;
      console.warn(
        `  ${label}: tentativa ${attempt}/${retries} falhou — ${err.message}` +
          (isLast ? '' : ` — nova tentativa em ${delayMs}ms`),
      );
      if (!isLast) {
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `${label} esgotou ${retries} tentativa(s) após k6. Último erro: ${lastError?.message}`,
  );
}

function parseK6Metrics(output) {
  const metrics = {};
  const lines = String(output || '').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s+[✓✗]?\s*([\w_]+)\.*:\s+(\d+)/);
    if (m) {
      metrics[m[1]] = Number(m[2]);
    }
  }
  return metrics;
}

const SENSITIVE_K6_ENV_KEYS = new Set([
  'USER_PASSWORD',
  'APPROVER_PASSWORD',
  'TEST_PASSWORD',
  'LOGIN_PASSWORD',
]);

function maskK6EnvValue(key, value) {
  if (SENSITIVE_K6_ENV_KEYS.has(key)) return '***';
  return value;
}

function resolveLoadTestEnv(baseUrl) {
  const flag = String(process.env.LOAD_TEST_ENV || '')
    .trim()
    .toLowerCase();
  if (flag === 'production' || flag === 'prod') return 'production';
  if (flag === 'local' || flag === 'dev' || flag === 'development') return 'local';
  const url = String(baseUrl || '').toLowerCase();
  if (/railway\.app|rlwy\.net/.test(url)) return 'production';
  return 'local';
}

function buildK6Env(stepEnv, config) {
  const userEmail = config.userEmail;
  const env = {
    BASE_URL: config.baseUrl,
    LOAD_TEST_ENV: resolveLoadTestEnv(config.baseUrl),
    USER_EMAIL: userEmail,
    USER_PASSWORD: config.userPassword,
    // Scripts de cotação/aprovação RM aceitam aliases explícitos (mesmo valor do pipeline).
    APPROVER_EMAIL: userEmail,
    APPROVER_PASSWORD: config.userPassword,
    // Aprovação OC: se não houver 3 usuários distintos, cada papel usa USER_EMAIL.
    COMPRAS_EMAIL: process.env.COMPRAS_EMAIL || userEmail,
    GESTOR_EMAIL: process.env.GESTOR_EMAIL || userEmail,
    DIRETORIA_EMAIL: process.env.DIRETORIA_EMAIL || userEmail,
    ...(config.costCenterIds ? { COST_CENTER_IDS: config.costCenterIds } : {}),
    ...(process.env.MATERIAL_ID ? { MATERIAL_ID: process.env.MATERIAL_ID } : {}),
    ...(process.env.SUPPLIER_ID ? { SUPPLIER_ID: process.env.SUPPLIER_ID } : {}),
    ...stepEnv,
  };
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

function runK6Step(k6Bin, script, env) {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script k6 não encontrado: ${scriptPath}`);
  }

  const args = ['run'];
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }
  args.push(scriptPath);

  const envPreview = Object.entries(env)
    .map(([k, v]) => `-e ${k}=${maskK6EnvValue(k, v)}`)
    .join(' ');

  console.log(`\n${'='.repeat(78)}`);
  console.log(`▶ ${script}`);
  console.log(`  k6 ${envPreview} scripts/${script}`);
  console.log('='.repeat(78));

  const child = spawnSync(k6Bin, args, {
    encoding: 'utf8',
    shell: true,
    cwd: SCRIPTS_DIR,
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });

  const stdout = child.stdout || '';
  const stderr = child.stderr || '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  return {
    exitCode: child.status ?? 1,
    output: stdout + stderr,
    metrics: parseK6Metrics(stdout + stderr),
  };
}

function checkExpectedMetrics(metrics, expected) {
  const failures = [];
  for (const [name, expectedCount] of Object.entries(expected)) {
    const actual = metrics[name];
    if (actual !== expectedCount) {
      failures.push(`${name}: esperado ${expectedCount}, obtido ${actual ?? 'ausente'}`);
    }
  }
  return failures;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m${rem}s`;
}

async function runPipeline({ title, config, steps }) {
  const startedAt = Date.now();
  const results = [];

  console.log(`\n${'#'.repeat(78)}`);
  console.log(`# ${title}`);
  console.log(
    `# ITERATIONS=${config.iterations} | VUS=${config.vus}` +
      (config.parcelCount ? ` | PARCEL_COUNT=${config.parcelCount}` : '') +
      ` | BASE_URL=${config.baseUrl}` +
      ` | LOAD_TEST_ENV=${resolveLoadTestEnv(config.baseUrl)}`,
  );
  console.log(`${'#'.repeat(78)}\n`);

  await healthCheck(config.baseUrl);
  const k6Bin = resolveK6(config.k6Bin);
  console.log(`k6: ${k6Bin.trim()}`);

  let baseline = await snapshotCounts(config);
  console.log(
    `Snapshot inicial — PENDING RM=${baseline.pendingRm} | APPROVED RM=${baseline.approvedRm} | ` +
      `PENDING_COMPRAS OC=${baseline.pendingComprasOc} | APPROVED OC=${baseline.approvedOc} | ` +
      `FINALIZED OC=${baseline.finalizedOc}`,
  );

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const stepNo = i + 1;
    const stepStarted = Date.now();
    const stepEnv = buildK6Env(
      typeof step.env === 'function' ? step.env(config) : step.env,
      config,
    );
    const expectedMetrics =
      typeof step.expectedMetrics === 'function'
        ? step.expectedMetrics(config)
        : step.expectedMetrics;

    let runResult;
    try {
      runResult = runK6Step(k6Bin, step.script, stepEnv);
    } catch (err) {
      printFailure(title, stepNo, step.name, err.message, results);
      process.exit(1);
    }

    const metricFailures = checkExpectedMetrics(runResult.metrics, expectedMetrics);
    const k6Failed = runResult.exitCode !== 0;

    let verifyResult = { ok: true, detail: 'verificação API não exigida' };
    if (!k6Failed && metricFailures.length === 0 && step.verify) {
      try {
        const after = await snapshotCountsWithRetry(config, {
          label: `verificação API etapa ${stepNo} (${step.name})`,
        });
        verifyResult = await step.verify({ baseline, after, config, metrics: runResult.metrics });
        baseline = after;
      } catch (err) {
        verifyResult = { ok: false, detail: err.message };
      }
    } else if (!step.verify) {
      baseline = await snapshotCountsWithRetry(config, {
        label: `snapshot pós-etapa ${stepNo} (${step.name})`,
        initialDelayMs: 0,
      });
    }

    const stepOk = !k6Failed && metricFailures.length === 0 && verifyResult.ok;
    const result = {
      stepNo,
      name: step.name,
      script: step.script,
      ok: stepOk,
      durationMs: Date.now() - stepStarted,
      exitCode: runResult.exitCode,
      metrics: runResult.metrics,
      expectedMetrics,
      metricFailures,
      verifyDetail: verifyResult.detail,
    };
    results.push(result);

    if (!stepOk) {
      const reasons = [];
      if (k6Failed) reasons.push(`k6 terminou com código ${runResult.exitCode}`);
      if (metricFailures.length) reasons.push(metricFailures.join('; '));
      if (!verifyResult.ok) reasons.push(verifyResult.detail);
      printFailure(title, stepNo, step.name, reasons.join(' | '), results);
      process.exit(1);
    }

    console.log(
      `\n✓ Etapa ${stepNo}/${steps.length} concluída: ${step.name} (${formatDuration(result.durationMs)})`,
    );
  }

  printSuccess(title, results, Date.now() - startedAt);
}

function printFailure(title, stepNo, stepName, reason, results) {
  console.error(`\n${'!'.repeat(78)}`);
  console.error(`PIPELINE FALHOU — ${title}`);
  console.error(`Etapa ${stepNo}: ${stepName}`);
  console.error(`Motivo: ${reason}`);
  console.error('Execução interrompida. Etapas anteriores:');
  for (const r of results) {
    const mark = r.ok ? 'OK' : 'FALHOU';
    console.error(`  ${r.stepNo}. [${mark}] ${r.name} (${r.script})`);
  }
  console.error(`${'!'.repeat(78)}\n`);
}

function printSuccess(title, results, totalMs) {
  console.log(`\n${'#'.repeat(78)}`);
  console.log(`PIPELINE CONCLUÍDO COM SUCESSO — ${title}`);
  console.log(`Duração total: ${formatDuration(totalMs)}`);
  console.log(`${'#'.repeat(78)}`);
  for (const r of results) {
    const metricSummary = Object.entries(r.expectedMetrics)
      .map(([k, v]) => `${k}=${r.metrics[k] ?? '?'}/${v}`)
      .join(', ');
    console.log(
      `  ${r.stepNo}. ${r.name} — OK (${formatDuration(r.durationMs)})` +
        (metricSummary ? ` | ${metricSummary}` : ''),
    );
    if (r.verifyDetail) {
      console.log(`     API: ${r.verifyDetail}`);
    }
  }
  console.log(`${'#'.repeat(78)}\n`);
}

module.exports = {
  parseConfig,
  runPipeline,
  snapshotCounts,
  snapshotCountsWithRetry,
  fetchWithDetails,
  formatFetchError,
};
