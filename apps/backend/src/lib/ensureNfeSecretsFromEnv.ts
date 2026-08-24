import fs from 'fs';
import path from 'path';

/**
 * No Railway, costuma ser mais fácil colar o certificado em Base64 nas Variables
 * do que montar arquivo. Se NFE_CERT_BASE64 / NFE_CADEIA_BASE64 existirem, grava
 * os arquivos nos caminhos de NFE_CERT_PATH / NFE_CADEIA_PATH (ou padrão).
 */
export function ensureNfeSecretsFromEnv(): void {
  const secretsDir = path.resolve(process.cwd(), 'data', 'nfe-secrets');

  const writeIfNeeded = (b64Env: string, pathEnv: string, defaultName: string) => {
    const b64 = process.env[b64Env]?.trim();
    if (!b64) return;

    const dest =
      process.env[pathEnv]?.trim() || path.join(secretsDir, defaultName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(b64.replace(/\s+/g, ''), 'base64'));
    process.env[pathEnv] = dest;
    console.log(`   🔐 ${pathEnv} gravado a partir de ${b64Env}`);
  };

  writeIfNeeded('NFE_CERT_BASE64', 'NFE_CERT_PATH', 'certificado.p12');
  writeIfNeeded('NFE_CADEIA_BASE64', 'NFE_CADEIA_PATH', 'cadeia_producao.jks');
}
