/**
 * Windows: o query_engine do Prisma fica bloqueado enquanto o backend (tsx/node) está rodando.
 * Este script libera a porta 5000, roda `prisma generate` e informa para subir o backend de novo.
 */
const { spawnSync, execSync } = require('child_process');
const path = require('path');

const isWin = process.platform === 'win32';
const backendRoot = path.join(__dirname, '..');

function stopBackendOnWindows() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: 'utf8' }
    );
    const pids = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Backend parado (PID ${pid}) para liberar o Prisma.`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* porta livre */
  }

  // Watchers tsx do backend que ainda seguram o DLL
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -match 'apps[\\\\/]backend|tsx watch|src[\\\\/]index\\\\.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' }
    );
  } catch {
    /* ignore */
  }
}

if (isWin) {
  stopBackendOnWindows();
  // Pequena espera para o Windows soltar o handle do DLL
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
}

const result = spawnSync('npx', ['prisma', 'generate'], {
  cwd: backendRoot,
  stdio: 'inherit',
  shell: true
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

if (isWin) {
  console.log('\nPrisma Client gerado. Suba o backend de novo: npm run dev:backend');
}
