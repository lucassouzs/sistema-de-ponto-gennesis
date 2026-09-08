import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import {
  getSefazFetchGate,
  NfeRecebidaService,
  nfeAutoFetchPeriod,
  nfeJavaAvailable,
  SEFAZ_COOLDOWN_MS,
} from './NfeRecebidaService';
import { prisma } from '../lib/prisma';

const service = new NfeRecebidaService();
let started = false;
let fetchInFlight = false;
/** Expressão cron efetiva (após normalizar legado diário → horário). */
let activeCronExpression = '5 * * * *';

const DEFAULT_HOURLY_CRON = '5 * * * *';
/** Cron diário antigo; se ainda estiver no Railway, forçamos horário. */
const LEGACY_DAILY_CRONS = new Set(['0 6 * * *']);

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

function resolveCronExpression(): string {
  const raw = process.env.NFE_AUTO_FETCH_CRON?.trim();
  if (!raw) return DEFAULT_HOURLY_CRON;
  if (LEGACY_DAILY_CRONS.has(raw)) {
    console.warn(
      `[nfe-auto] NFE_AUTO_FETCH_CRON="${raw}" é o agendamento diário antigo — usando "${DEFAULT_HOURLY_CRON}" (a cada hora). Remova ou atualize a variável no Railway.`
    );
    return DEFAULT_HOURLY_CRON;
  }
  return raw;
}

/**
 * Próximo disparo aproximado do cron horário `M * * * *` (minuto M de cada hora).
 */
export function nextHourlyCronFire(after: Date = new Date(), expression = activeCronExpression): Date | null {
  const m = /^(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/.exec(expression.trim());
  if (!m) return null;
  const minute = Number(m[1]);
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  const next = new Date(after.getTime());
  next.setSeconds(0, 0);
  next.setMilliseconds(0);
  next.setMinutes(minute);
  if (next.getTime() <= after.getTime()) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}

/**
 * Momento em que a próxima busca automática pode ocorrer:
 * o próximo tick do cron que já esteja após lastFetchAt + cooldown.
 */
export async function getNfeAutoFetchSchedule(): Promise<{
  cron: string;
  lastFetchAt: string | null;
  nextFetchAt: string | null;
}> {
  const state = await prisma.nfeDistribuicaoState.findUnique({
    where: { id: 'default' },
  });
  const last = state?.lastFetchAt ?? null;
  const now = new Date();
  const eligibleFrom = last
    ? new Date(Math.max(now.getTime(), last.getTime() + SEFAZ_COOLDOWN_MS))
    : now;
  const cronAt = nextHourlyCronFire(eligibleFrom, activeCronExpression);

  return {
    cron: activeCronExpression,
    lastFetchAt: last?.toISOString() ?? null,
    nextFetchAt: cronAt?.toISOString() ?? eligibleFrom.toISOString(),
  };
}

/**
 * Busca automática horário (respeitando cooldown da SEFAZ).
 * Nunca consulta enquanto o CNPJ ainda está no bloqueio 656 / intervalo mínimo —
 * senão a SEFAZ renova as ~60 min e fica em loop.
 *
 * Liga com NFE_AUTO_FETCH_ENABLED=1 (padrão: ligado se NFE_JAVA_ENABLED=1).
 * Cron padrão: a cada hora (minuto 5); a gate pode pular a hora se ainda estiver cedo.
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

  const gate = await getSefazFetchGate();
  if (!gate.ok) {
    const why =
      gate.reason === 'blocked'
        ? 'ainda bloqueado (656) — não consultar para não renovar'
        : 'intervalo mínimo entre consultas';
    console.log(
      `[nfe-auto] ignorado (${trigger}) — ${why} (~${gate.waitMin} min). Última: ${gate.lastFetchAt}`
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
    if (result.skippedDueToCooldown) {
      console.log(`[nfe-auto] pulado sem consultar SEFAZ: ${result.message}`);
      return null;
    }
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

  // Não aborta o cron se o Java ainda estiver instalando: cada tick revalida.
  if (javaEnabled() && !nfeJavaAvailable()) {
    console.warn(
      '[nfe-auto] Java ainda não está no PATH — agenda ligada mesmo assim; cada tentativa revalida o runtime'
    );
  }

  const expression = resolveCronExpression();
  if (!cron.validate(expression)) {
    console.error(`[nfe-auto] cron inválido: ${expression}`);
    return;
  }

  started = true;
  activeCronExpression = expression;
  const tz = process.env.TZ || 'America/Sao_Paulo';
  const intervalMin = Math.round(SEFAZ_COOLDOWN_MS / 60_000);

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
    `[nfe-auto] agendado: "${expression}" (${tz}) — cooldown ${intervalMin} min (não consulta se bloqueado) — ano ${nfeAutoFetchPeriod().periodFrom.slice(0, 4)}`
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
      `[nfe-auto] também tenta ~${Math.round(wait / 1000)}s após o boot se o cooldown SEFAZ permitir`
    );
  }
}
