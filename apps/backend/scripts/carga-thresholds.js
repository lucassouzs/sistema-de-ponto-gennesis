/**
 * Thresholds de duração HTTP para scripts k6 (local vs produção).
 *
 * Detecção de produção (nessa ordem):
 *   1. LOAD_TEST_ENV=production|prod  → produção
 *   2. LOAD_TEST_ENV=local|dev        → local
 *   3. BASE_URL contém railway.app / rlwy.net → produção
 *   4. caso contrário → local
 *
 * Uso nos scripts k6:
 *   import { p95 } from './carga-thresholds.js';
 *   'http_req_duration{endpoint:create_rm}': [p95(5000)],        // local 5s, prod 8s
 *   'http_req_duration{endpoint:oc_generate}': [p95(8000, 20000)], // prod explícito
 */

/** Teto padrão de p95 em produção para endpoints típicos de API (sem upload). */
export const PROD_P95_DEFAULT_MS = 8000;

export function isProductionLoadEnv(baseUrl) {
  const flag = String(__ENV.LOAD_TEST_ENV || '')
    .trim()
    .toLowerCase();
  if (flag === 'production' || flag === 'prod') return true;
  if (flag === 'local' || flag === 'dev' || flag === 'development') return false;

  const url = String(baseUrl || __ENV.BASE_URL || '').toLowerCase();
  return /railway\.app|rlwy\.net/.test(url);
}

export function loadTestEnvLabel(baseUrl) {
  return isProductionLoadEnv(baseUrl) ? 'production' : 'local';
}

/**
 * Retorna string de threshold k6 `p(95)<N`.
 * @param {number} localMs — limite em localhost
 * @param {number} [prodMs] — limite em produção; default max(localMs, 8000)
 */
export function p95(localMs, prodMs) {
  const local = Number(localMs);
  const prod =
    prodMs != null && prodMs !== ''
      ? Number(prodMs)
      : Math.max(local, PROD_P95_DEFAULT_MS);
  const ms = isProductionLoadEnv() ? prod : local;
  return `p(95)<${ms}`;
}

/**
 * Timeout do bloco setup() do k6 (default do k6: 60s).
 * Produção: 180s (setup com listagem + N GETs de detalhe sob latência Railway).
 * Local: 120s (margem acima do default).
 */
export function k6SetupTimeout() {
  return isProductionLoadEnv() ? '180s' : '120s';
}
