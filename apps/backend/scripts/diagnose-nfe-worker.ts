import '../src/loadEnv';
import { spawn } from 'child_process';
import path from 'path';
import { prisma } from '../src/lib/prisma';

async function main() {
  const state = await prisma.nfeDistribuicaoState.findUnique({ where: { id: 'default' } });
  const ultNsu = state?.ultimoNsu || '000000000000000';
  const jar = process.env.NFE_WORKER_JAR!;
  const javaBin = process.env.NFE_JAVA_BIN || 'java';
  const outDir = path.resolve(process.cwd(), 'data', 'nfe-xmls');

  console.log('java :', javaBin);
  console.log('jar  :', jar);
  console.log('nsu  :', ultNsu);

  const child = spawn(
    javaBin,
    [
      '-jar',
      jar,
      `--ult-nsu=${ultNsu}`,
      `--out-dir=${outDir}`,
      '--max-consultas=3',
    ],
    { env: { ...process.env }, windowsHide: true }
  );

  let out = '';
  let err = '';
  child.stdout.on('data', (c) => (out += String(c)));
  child.stderr.on('data', (c) => (err += String(c)));
  await new Promise<void>((resolve) => child.on('close', () => resolve()));

  console.log('\n--- stdout ---');
  console.log(out.trim() || '(vazio)');
  console.log('\n--- stderr ---');
  console.log(err.trim() || '(vazio)');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
