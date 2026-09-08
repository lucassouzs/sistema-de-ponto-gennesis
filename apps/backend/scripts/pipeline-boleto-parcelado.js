#!/usr/bin/env node
/**
 * Pipeline completo — fluxo BOLETO parcelado (2 parcelas → FINALIZED).
 *
 * Uso (padrão 10 OCs):
 *   node scripts/pipeline-boleto-parcelado.js
 *
 * Parâmetros:
 *   --iterations=10 --vus=5 --parcel-count=2 --payment-vus=3
 */

const { parseConfig, runPipeline } = require('./pipeline-lib');

const config = parseConfig({
  defaultIterations: 10,
  defaultVus: 5,
  defaultParcelCount: 2,
  defaultPaymentVus: 3,
});

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
    name: 'Cotação BOLETO parcelado → OC',
    script: 'teste-carga-cotacao-boleto-parcelado.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.vus),
      PARCEL_COUNT: String(cfg.parcelCount),
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
    name: 'Ciclo de parcelas (para em APPROVED + todas PAID)',
    script: 'teste-carga-pagamento-oc-boleto-parcelado.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.paymentVus),
      PARCEL_COUNT: String(cfg.parcelCount),
    }),
    expectedMetrics: (cfg) => ({
      installment_boleto_uploaded: cfg.iterations * cfg.parcelCount,
      installment_paid: cfg.iterations * cfg.parcelCount,
      oc_all_installments_paid: cfg.iterations,
      financial_control_created: cfg.iterations,
    }),
    verify: ({ baseline, after, config: cfg }) => {
      const delta = after.parcelAllPaid - baseline.parcelAllPaid;
      const ok = delta >= cfg.iterations;
      return {
        ok,
        detail: ok
          ? `OCs APPROVED com ${cfg.parcelCount} parcelas PAID +${delta} (>= ${cfg.iterations})`
          : `OCs prontas +${delta} (esperado >= ${cfg.iterations})`,
      };
    },
  },
  {
    name: 'Finalização (validação → NF → FINALIZED)',
    script: 'teste-carga-finalizar-boleto-parcelado.js',
    env: (cfg) => ({
      ITERATIONS: String(cfg.iterations),
      VUS: String(cfg.paymentVus),
      PARCEL_COUNT: String(cfg.parcelCount),
    }),
    expectedMetrics: (cfg) => ({
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
  title: 'Pipeline BOLETO parcelado',
  config,
  steps,
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
