import { PrismaClient, Prisma } from '@prisma/client';

// Configurar DATABASE_URL com connection pool limit se não tiver
let databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl && !databaseUrl.includes('connection_limit')) {
  // Adiciona connection_limit se não existir
  const separator = databaseUrl.includes('?') ? '&' : '?';
  databaseUrl = `${databaseUrl}${separator}connection_limit=5&pool_timeout=10`;
}

// Configurar logs do Prisma
// Se PRISMA_LOG_QUERIES=true, mostra todas as queries SQL (útil para debug)
// Por padrão, mostra apenas erros e warnings
const prismaLogLevels: Prisma.LogLevel[] = process.env.PRISMA_LOG_QUERIES === 'true' 
  ? ['query', 'error', 'warn'] 
  : ['error', 'warn'];

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl || process.env.DATABASE_URL,
    },
  },
  log: prismaLogLevels,
});

// Configurar pool de conexões para evitar "too many connections"
// Isso garante que não abra mais conexões do que o banco permite
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Garante que o @prisma/client inclui o Drive (se faltar, reinicie o backend após `npx prisma generate`)
const p = prisma as { driveFolder?: unknown; driveFile?: unknown };
if (!p.driveFolder || !p.driveFile) {
  console.error(
    '❌ @prisma/client sem modelos Drive. Rode na pasta apps/backend: npx prisma generate e reinicie o servidor.',
  );
} else if (process.env.NODE_ENV === 'development') {
  console.log('✅ Prisma: modelos Drive (drive_folders / drive_files) carregados.');
}

export { prisma };

