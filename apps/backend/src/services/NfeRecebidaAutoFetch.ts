import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import {
  NfeRecebidaService,
  nfeAutoFetchPeriod
} from './NfeRecebidaService';

const service = new NfeRecebidaService();
let started = false;

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (v == null || v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes';
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
 * Busca automática diária (ano configurado → hoje).
 * Liga com NFE_AUTO_FETCH_ENABLED=1 no .env / Railway.
 */
export async function runNfeAutoFetch(trigger: 'cron' | 'boot' | 'http' = 'cron') {
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
  if (!envBool('NFE_AUTO_FETCH_ENABLED', false)) {
    console.log('[nfe-auto] desabilitado (defina NFE_AUTO_FETCH_ENABLED=1 para ligar)');
    return;
  }

  const javaEnabled =
    process.env.NFE_JAVA_ENABLED === '1' || process.env.NFE_JAVA_ENABLED === 'true';
  if (javaEnabled && !nfeWorkerJarReady()) {
    console.warn(
      '[nfe-auto] NFE_JAVA_ENABLED=1 mas o JAR do worker não está no servidor — agenda desligada até o próximo deploy com vendor/nfe-distribuicao.jar'
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

  // Opcional: uma rodada poucos minutos após o boot (útil no Railway após deploy)
  if (envBool('NFE_AUTO_FETCH_ON_BOOT', false)) {
    const delayMs = Number(process.env.NFE_AUTO_FETCH_BOOT_DELAY_MS || 60_000);
    setTimeout(() => {
      void runNfeAutoFetch('boot').catch(() => {
        /* já logado */
      });
    }, Number.isFinite(delayMs) ? delayMs : 60_000);
    console.log(`[nfe-auto] também rodará ~${Math.round(delayMs / 1000)}s após o boot`);
  }
}
