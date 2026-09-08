#!/usr/bin/env node
/**
 * Pipeline completo — fluxo BOLETO parcela única (BOLETO_30 → FINALIZED).
 *
 * Uso (padrão 20 OCs):
 *   node scripts/pipeline-boleto-unico.js
 *
 * Parâmetros:
 *   --iterations=20 --vus=5
 *   PAYMENT_CONDITION=BOLETO_30 (via env, repassado à cotação)
 */

const { parseConfig, runPipeline } = require('./pipeline-lib');

const config = parseConfig({
  defaultIterations: 20,
  defaultVus: 5,
});

const paymentCondition = process.env.PAYMENT_CONDITION || 'BOLETO_30';

const steps = [
  {
    name: 'Criar RMs',
    script: 'teste-carga-suprimentos.js',
    env: (cfg) => ({
      MODE: 'seed',
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.vus),
    }),
    expectedMetrics: (cfg) => ({ rm_created: cfg.iterations }),
    verify: ({ baseline, after, config: cfg }) => {
      const delta = after.pendingRm - baseline.pendingRm;
      const ok = delta >= cfg.iterations;
      return {
        ok,
        detail: ok
          ? `PENDING RM +${delta} (>= ${cfg.iterations})`
          : `PENDING RM +${delta} (esperado >= ${cfg.iterations})`,
      };
    },
  },
  {
    name: 'Aprovar RMs',
    script: 'teste-carga-aprovacao-rm.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.vus),
    }),
    expectedMetrics: (cfg) => ({ rm_approved: cfg.iterations }),
    verify: ({ baseline, after, config: cfg }) => {
      const delta = after.approvedRm - baseline.approvedRm;
      const ok = delta >= cfg.iterations;
      return {
        ok,
        detail: ok
          ? `APPROVED RM +${delta} (>= ${cfg.iterations})`
          : `APPROVED RM +${delta} (esperado >= ${cfg.iterations})`,
      };
    },
  },
  {
    name: 'Cotação BOLETO_30 → OC',
    script: 'teste-carga-cotacao-boleto.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.vus),
      PAYMENT_CONDITION: paymentCondition,
    }),
    expectedMetrics: (cfg) => ({
      quote_map_created: cfg.iterations,
      quotes_saved: cfg.iterations,
      oc_generated: cfg.iterations,
    }),
    verify: ({ baseline, after, config: cfg }) => {
      const delta = after.pendingComprasOc - baseline.pendingComprasOc;
      const ok = delta >= cfg.iterations;
      return {
        ok,
        detail: ok
          ? `PENDING_COMPRAS OC +${delta} (>= ${cfg.iterations})`
          : `PENDING_COMPRAS OC +${delta} (esperado >= ${cfg.iterations})`,
      };
    },
  },
  {
    name: 'Aprovar OCs',
    script: 'teste-carga-aprovacao-oc.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.vus),
    }),
    expectedMetrics: (cfg) => ({
      oc_aprovada_compras: cfg.iterations,
      oc_aprovada_gestor: cfg.iterations,
      oc_aprovada_diretoria: cfg.iterations,
    }),
    verify: ({ baseline, after, config: cfg }) => {
      const delta = after.approvedOc - baseline.approvedOc;
      const ok = delta >= cfg.iterations;
      return {
        ok,
        detail: ok
          ? `APPROVED OC +${delta} (>= ${cfg.iterations})`
          : `APPROVED OC +${delta} (esperado >= ${cfg.iterations})`,
      };
    },
  },
  {
    name: 'Pagamento BOLETO único → FINALIZED',
    script: 'teste-carga-pagamento-oc-boleto.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.vus),
    }),
    expectedMetrics: (cfg) => ({
      boleto_uploaded: cfg.iterations,
      boleto_attached: cfg.iterations,
      phase_released: cfg.iterations,
      financial_control_created: cfg.iterations,
      proof_attached: cfg.iterations,
      nf_attached: cfg.iterations,
      oc_finalized: cfg.iterations,
    }),
    verify: ({ baseline, after, config: cfg }) => {
      const delta = after.finalizedOc - baseline.finalizedOc;
      const ok = delta >= cfg.iterations;
      return {
        ok,
        detail: ok
          ? `FINALIZED OC +${delta} (>= ${cfg.iterations})`
          : `FINALIZED OC +${delta} (esperado >= ${cfg.iterations})`,
      };
    },
  },
];

runPipeline({
  title: 'Pipeline BOLETO único (BOLETO_30)',
  config,
  steps,
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
