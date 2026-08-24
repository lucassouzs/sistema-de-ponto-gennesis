import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import {
  NfeRecebidaService,
  nfeAutoFetchPeriod,
  nfeJavaAvailable
} from './NfeRecebidaService';
import { prisma } from '../lib/prisma';

const service = new NfeRecebidaService();
let started = false;
let fetchInFlight = false;

/** Intervalo mínimo entre consultas SEFAZ (padrão ~55 min — abaixo de 1h para alinhar ao cron horário). */
function minIntervalMs(): number {
  const raw = Number(process.env.NFE_AUTO_FETCH_MIN_INTERVAL_MS?.trim());
  if (Number.isFinite(raw) && raw >= 60_000) return raw;
  return 55 * 60 * 1000;
}

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (v == null || v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes';
}

function javaEnabled(): boolean {
  return process.env.NFE_JAVA_ENABLED === '1' || process.env.NFE_JAVA_ENABLED === 'true';
}

function nfeWorkerJarReady(): boolean {
  if (process.env.NFE_WORKER_JAR?.trim() && fs.existsSync(process.env.NFE_WORKER_JAR.trim())) {
    return true;
  }
  return [
    path.resolve(process.cwd(), 'vendor', 'nfe-distribuicao.jar'),
    path.resolve(process.cwd(), 'dist', 'nfe-distribuicao.jar'),
    path.resolve(process.cwd(), '../../apps/backend/vendor/nfe-distribuicao.jar'),
  ].some((p) => fs.existsSync(p));
}

/**
 * Só consulta a SEFAZ se a última busca (sucesso ou bloqueio) já passou do intervalo mínimo.
 * Evita cStat 656 por consultas repetidas no mesmo CNPJ.
 */
export async function canFetchSefazNow(): Promise<{
  ok: boolean;
  waitMin?: number;
  lastFetchAt?: string | null;
}> {
  const state = await prisma.nfeDistribuicaoState.findUnique({ where: { id: 'default' } });
  if (!state?.lastFetchAt) {
    return { ok: true, lastFetchAt: null };
  }
  const elapsed = Date.now() - state.lastFetchAt.getTime();
  const minMs = minIntervalMs();
  if (elapsed >= minMs) {
    return { ok: true, lastFetchAt: state.lastFetchAt.toISOString() };
  }
  const waitMin = Math.max(1, Math.ceil((minMs - elapsed) / 60_000));
  return {
    ok: false,
    waitMin,
    lastFetchAt: state.lastFetchAt.toISOString(),
  };
}

/**
 * Busca automática horário (respeitando intervalo mínimo da SEFAZ).
 * Liga com NFE_AUTO_FETCH_ENABLED=1 (padrão: ligado se NFE_JAVA_ENABLED=1).
 * Cron padrão: a cada hora (minuto 5).
 */
export async function runNfeAutoFetch(trigger: 'cron' | 'boot' | 'http' = 'cron') {
  if (fetchInFlight) {
    console.log(`[nfe-auto] ignorado (${trigger}) — já há busca em andamento`);
    return null;
  }

  if (javaEnabled() && !nfeJavaAvailable()) {
    console.error('[nfe-auto] Java ainda não está disponível — busca adiada');
    return null;
  }

  const gate = await canFetchSefazNow();
  if (!gate.ok) {
    console.log(
      `[nfe-auto] ignorado (${trigger}) — aguardando intervalo SEFAZ (~${gate.waitMin} min). Última: ${gate.lastFetchAt}`
    );
    return null;
  }

  fetchInFlight = true;
  const period = nfeAutoFetchPeriod();
  console.log(
    `[nfe-auto] início (${trigger}) período ${period.periodFrom} → ${period.periodTo}`
  );
  try {
    const result = await service.buscar({
      ...period,
      trigger: 'cron'
    });
    console.log(`[nfe-auto] ok: ${result.message}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[nfe-auto] falha: ${msg}`);
    return null;
  } finally {
    fetchInFlight = false;
  }
}

export function startNfeAutoFetchScheduler(): void {
  if (started) return;

  const enabledDefault = javaEnabled();
  if (!envBool('NFE_AUTO_FETCH_ENABLED', enabledDefault)) {
    console.log('[nfe-auto] desabilitado (defina NFE_AUTO_FETCH_ENABLED=1 para ligar)');
    return;
  }

  if (javaEnabled() && !nfeWorkerJarReady()) {
    console.warn(
      '[nfe-auto] NFE_JAVA_ENABLED=1 mas o JAR do worker não está no servidor — agenda desligada até o próximo deploy com vendor/nfe-distribuicao.jar'
    );
    return;
  }
  if (javaEnabled() && !nfeJavaAvailable()) {
    console.warn(
      '[nfe-auto] Java não encontrado — a busca automática fica pendente até o JRE ser instalado no boot'
    );
    return;
  }

  // A cada hora, no minuto 5 — alinhado ao limite de ~1h da SEFAZ após consulta sem novidade / 656.
  const expression = process.env.NFE_AUTO_FETCH_CRON?.trim() || '5 * * * *';
  if (!cron.validate(expression)) {
    console.error(`[nfe-auto] cron inválido: ${expression}`);
    return;
  }

  started = true;
  const tz = process.env.TZ || 'America/Sao_Paulo';
  const intervalMin = Math.round(minIntervalMs() / 60_000);

  cron.schedule(
    expression,
    () => {
      void runNfeAutoFetch('cron').catch(() => {
        /* já logado */
      });
    },
    { timezone: tz }
  );

  console.log(
    `[nfe-auto] agendado: "${expression}" (${tz}) — intervalo mín. ${intervalMin} min — ano ${nfeAutoFetchPeriod().periodFrom.slice(0, 4)}`
  );

  const defaultOnBoot =
    !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
  if (envBool('NFE_AUTO_FETCH_ON_BOOT', defaultOnBoot)) {
    const delayMs = Number(process.env.NFE_AUTO_FETCH_BOOT_DELAY_MS || 90_000);
    const wait = Number.isFinite(delayMs) ? delayMs : 90_000;
    setTimeout(() => {
      void runNfeAutoFetch('boot');
    }, wait);
    console.log(
      `[nfe-auto] também tenta ~${Math.round(wait / 1000)}s após o boot se o intervalo SEFAZ permitir`
    );
  }
}
