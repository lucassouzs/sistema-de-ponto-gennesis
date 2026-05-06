/**
 * Repete `prisma migrate deploy` e, em caso de P3018, marca a migração indicada como aplicada.
 * Use quando o banco ja esta alinhado ao schema mas o historico de migracoes do Prisma esta atrasado.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const max = 80;

for (let i = 0; i < max; i++) {
  try {
    execSync('npx prisma migrate deploy', { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    console.log('migrate deploy concluiu com sucesso.');
    process.exit(0);
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`;
    console.log(out);

    const failed = out.match(/Migration name:\s*(\S+)/);
    const p3009 = out.match(/The `(\S+)` migration started/m);

    const name = failed?.[1] || p3009?.[1];
    if (!name) {
      console.error('Não foi possível extrair o nome da migração. Corrija manualmente.');
      process.exit(1);
    }

    console.log(`\n>>> prisma migrate resolve --applied ${name}\n`);
    execSync(`npx prisma migrate resolve --applied ${name}`, { cwd: root, stdio: 'inherit' });
  }
}

console.error('Limite de tentativas atingido.');
process.exit(1);
