import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { unzipAll } from './unzipBuffer';

const MAX_ZIP_MEMORY_BYTES = 120 * 1024 * 1024;

function tryExtractWithCommand(command: string, args: string[], dir: string): boolean {
  try {
    execFileSync(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return walkFilesRecursive(dir).length > 0;
  } catch {
    return false;
  }
}

/** Extrai ZIP para uma pasta temporária (preferência: CLI no disco; fallback: buffer). */
export function extractZipArchive(zipPath: string): { dir: string; cleanup: () => void } {
  const dir = path.join(os.tmpdir(), `juridico-zip-${uuidv4()}`);
  fs.mkdirSync(dir, { recursive: true });

  const cleanup = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  if (
    tryExtractWithCommand('unzip', ['-q', '-o', zipPath, '-d', dir], dir) ||
    tryExtractWithCommand('tar', ['-xf', zipPath, '-C', dir], dir)
  ) {
    return { dir, cleanup };
  }

  // Fallback para ZIPs pequenos / ambientes sem unzip/tar funcional
  try {
    const stat = fs.statSync(zipPath);
    if (stat.size > MAX_ZIP_MEMORY_BYTES) {
      throw new Error(
        `ZIP muito grande (${Math.round(stat.size / (1024 * 1024))} MB). No servidor, instale unzip ou envie ZIPs menores.`,
      );
    }
    const buf = fs.readFileSync(zipPath);
    const entries = unzipAll(buf);
    for (const entry of entries) {
      const safe = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!safe || safe.includes('..')) continue;
      const outPath = path.join(dir, ...safe.split('/'));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, entry.data);
    }
    return { dir, cleanup };
  } catch (err) {
    cleanup();
    const msg =
      err instanceof Error ? err.message : 'Falha ao extrair o ZIP no servidor.';
    throw new Error(msg);
  }
}

export function walkFilesRecursive(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}
