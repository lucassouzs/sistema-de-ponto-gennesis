import { execFile } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const TEMURIN_JRE17_LINUX_X64 =
  'https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jre/hotspot/normal/eclipse?project=jdk';

function findJavaBinary(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const names = process.platform === 'win32' ? ['java.exe'] : ['java'];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && names.includes(entry.name) && path.basename(current) === 'bin') {
        return full;
      }
    }
  }
  return null;
}

function findJavaInPath(): string | null {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['java.exe'] : ['java'];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function bundledJavaCandidates(): string[] {
  const cwd = process.cwd();
  const root = path.resolve(cwd, '../..');
  const name = process.platform === 'win32' ? 'java.exe' : 'java';
  return [
    process.env.NFE_JAVA_BIN?.trim() || '',
    path.resolve(cwd, 'vendor', 'jdk', 'bin', name),
    path.resolve(cwd, 'dist', 'jdk', 'bin', name),
    path.resolve(root, 'apps/backend/vendor/jdk/bin', name),
    path.resolve(root, 'apps/backend/dist/jdk/bin', name),
    path.resolve(root, '.tools/jdk/bin', name),
  ].filter(Boolean);
}

function activateJavaBin(javaBin: string): string {
  process.env.NFE_JAVA_BIN = javaBin;
  const binDir = path.dirname(javaBin);
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
  return javaBin;
}

function downloadHttps(url: string, dest: string, redirects = 0): Promise<void> {
  if (redirects > 8) return Promise.reject(new Error('Muitos redirecionamentos ao baixar o JRE'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 180_000 }, (res) => {
      const code = res.statusCode || 0;
      const location = res.headers.location;
      if (code >= 300 && code < 400 && location) {
        res.resume();
        downloadHttps(location, dest, redirects + 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error(`Falha ao baixar JRE (HTTP ${code})`));
        return;
      }
      const out = fs.createWriteStream(dest);
      pipeline(res, out).then(resolve, reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Timeout ao baixar JRE'));
    });
  });
}

/**
 * Garante um `java` utilizável no runtime (Railway não traz JDK no PATH).
 * Se não achar, baixa o JRE 17 (Linux x64) para data/nfe-jdk.
 */
export async function ensureNfeJavaRuntime(): Promise<string | null> {
  for (const candidate of bundledJavaCandidates()) {
    if (fs.existsSync(candidate)) {
      console.log(`   ☕ Java: ${activateJavaBin(candidate)}`);
      return candidate;
    }
  }

  const fromPath = findJavaInPath();
  if (fromPath) {
    console.log(`   ☕ Java: ${activateJavaBin(fromPath)}`);
    return fromPath;
  }

  if (process.platform === 'win32') {
    console.warn('   ☕ Java: não encontrado no Windows (defina NFE_JAVA_BIN)');
    return null;
  }

  const destRoot = path.resolve(process.cwd(), 'data', 'nfe-jdk');
  const cached = findJavaBinary(destRoot);
  if (cached) {
    try {
      fs.chmodSync(cached, 0o755);
    } catch {
      /* ignore */
    }
    console.log(`   ☕ Java: ${activateJavaBin(cached)} (cache)`);
    return cached;
  }

  fs.mkdirSync(destRoot, { recursive: true });
  const archive = path.join(destRoot, 'jre17.tar.gz');
  console.log('   ☕ Java ausente — baixando JRE 17 (Temurin) para data/nfe-jdk…');
  try {
    await downloadHttps(TEMURIN_JRE17_LINUX_X64, archive);
    await execFileAsync('tar', ['-xzf', archive, '-C', destRoot], { timeout: 120_000 });
    fs.unlink(archive, () => undefined);
  } catch (err) {
    console.error(
      '   ☕ Falha ao instalar JRE no runtime:',
      err instanceof Error ? err.message : err
    );
    return null;
  }

  const installed = findJavaBinary(destRoot);
  if (!installed) {
    console.error('   ☕ JRE baixado, mas o binário java não foi encontrado em data/nfe-jdk');
    return null;
  }
  try {
    fs.chmodSync(installed, 0o755);
  } catch {
    /* ignore */
  }
  console.log(`   ☕ Java: ${activateJavaBin(installed)} (instalado no boot)`);
  return installed;
}
