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

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ || 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function alreadyFetchedToday(): Promise<boolean> {
  const state = await prisma.nfeDistribuicaoState.findUnique({ where: { id: 'default' } });
  if (!state?.lastFetchAt) return false;
  const lastDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ || 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(state.lastFetchAt);
  return lastDay === todayInSaoPaulo();
}

/**
 * Busca automática diária (ano configurado → hoje).
 * Liga com NFE_AUTO_FETCH_ENABLED=1 (padrão: ligado se NFE_JAVA_ENABLED=1).
 */
export async function runNfeAutoFetch(trigger: 'cron' | 'boot' | 'http' = 'cron') {
  if (javaEnabled() && !nfeJavaAvailable()) {
    console.error('[nfe-auto] Java ainda não está disponível — busca adiada');
    return null;
  }

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

  const expression = process.env.NFE_AUTO_FETCH_CRON?.trim() || '0 6 * * *';
  if (!cron.validate(expression)) {
    console.error(`[nfe-auto] cron inválido: ${expression}`);
    return;
  }

  started = true;
  const tz = process.env.TZ || 'America/Sao_Paulo';

  cron.schedule(
    expression,
    () => {
      void runNfeAutoFetch('cron').catch(() => {
        /* já logado */
      });
    },
    { timezone: tz }
  );

  console.log(`[nfe-auto] agendado: "${expression}" (${tz}) — ano ${nfeAutoFetchPeriod().periodFrom.slice(0, 4)}`);

  const defaultOnBoot =
    !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
  if (envBool('NFE_AUTO_FETCH_ON_BOOT', defaultOnBoot)) {
    const delayMs = Number(process.env.NFE_AUTO_FETCH_BOOT_DELAY_MS || 90_000);
    const wait = Number.isFinite(delayMs) ? delayMs : 90_000;
    setTimeout(() => {
      void (async () => {
        try {
          if (await alreadyFetchedToday()) {
            console.log('[nfe-auto] boot ignorado — já houve busca hoje');
            return;
          }
          await runNfeAutoFetch('boot');
        } catch {
          /* já logado */
        }
      })();
    }, wait);
    console.log(`[nfe-auto] também rodará ~${Math.round(wait / 1000)}s após o boot se ainda não buscou hoje`);
  }
}
