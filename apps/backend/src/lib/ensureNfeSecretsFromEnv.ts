import fs from 'fs';
import path from 'path';

/**
 * Monta Base64 a partir de:
 * - NFE_XXX_BASE64 (único), ou
 * - NFE_XXX_BASE64_1 + _2 + _3… (quando passa do limite de 32KB do Railway)
 */
function readBase64Parts(prefix: string): string | null {
  const single = process.env[prefix]?.trim();
  if (single) return single.replace(/\s+/g, '');

  const parts: string[] = [];
  for (let i = 1; i <= 40; i++) {
    const chunk = process.env[`${prefix}_${i}`]?.trim();
    if (!chunk) break;
    parts.push(chunk.replace(/\s+/g, ''));
  }
  return parts.length > 0 ? parts.join('') : null;
}

function writeSecretFile(
  b64Prefix: string,
  pathEnv: string,
  defaultName: string,
  secretsDir: string
): void {
  const b64 = readBase64Parts(b64Prefix);
  if (!b64) return;

  const dest = process.env[pathEnv]?.trim() || path.join(secretsDir, defaultName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
  process.env[pathEnv] = dest;
  console.log(`   🔐 ${pathEnv} gravado a partir de ${b64Prefix}`);
}

/**
 * Certificado A1 (.p12) via Base64 nas Variables do Railway.
 * Cadeia SEFAZ (.jks): usa arquivo embutido em native/ se não houver env.
 */
export function ensureNfeSecretsFromEnv(): void {
  const secretsDir = path.resolve(process.cwd(), 'data', 'nfe-secrets');
  const nativeDir = path.resolve(process.cwd(), 'native');

  writeSecretFile('NFE_CERT_BASE64', 'NFE_CERT_PATH', 'certificado.p12', secretsDir);
  writeSecretFile('NFE_CADEIA_BASE64', 'NFE_CADEIA_PATH', 'cadeia_producao.jks', secretsDir);

  // Fallback: cadeia pública versionada no repo (não cabe numa Variable do Railway).
  if (!process.env.NFE_CADEIA_PATH?.trim()) {
    const bundled = path.join(nativeDir, 'cadeia_producao.jks');
    if (fs.existsSync(bundled)) {
      process.env.NFE_CADEIA_PATH = bundled;
      console.log(`   🔐 NFE_CADEIA_PATH = ${bundled} (embutida no deploy)`);
    }
  }
}
