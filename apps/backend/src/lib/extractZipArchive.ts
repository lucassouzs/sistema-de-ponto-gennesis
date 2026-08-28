import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { unzipAll } from './unzipBuffer';

/** Extrai ZIP para uma pasta temporária (preferência: tar no disco; fallback: buffer). */
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

  try {
    execFileSync('tar', ['-xf', zipPath, '-C', dir], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { dir, cleanup };
  } catch (tarErr) {
    // Fallback para ZIPs pequenos / ambientes sem tar funcional
    try {
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
    } catch {
      cleanup();
      const msg =
        tarErr instanceof Error ? tarErr.message : 'Falha ao extrair o ZIP no servidor.';
      throw new Error(msg);
    }
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
