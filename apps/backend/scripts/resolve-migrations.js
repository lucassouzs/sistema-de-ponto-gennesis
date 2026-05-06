#!/usr/bin/env node

/**
 * Script para resolver migrations falhadas no Prisma
 * Verifica se as tabelas existem e cria apenas as que faltam
 */

const { execSync } = require('child_process');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');

/**
 * Migrations que falharam no deploy (ex.: tabela ainda não existia) e é seguro marcar
 * como rolled-back para o Prisma reaplicar na ordem correta após novas migrations.
 */
const MIGRATIONS_TRY_ROLLBACK_IF_FAILED = ['20260416140000_dp_request_display_number'];

function tryRollbackFailedMigration(migrationName) {
  try {
    execSync(`npx prisma migrate resolve --rolled-back ${migrationName}`, {
      cwd: BACKEND_ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    console.log(`✅ Migration "${migrationName}" liberada (rolled-back) para reaplicação.`);
    return true;
  } catch (e) {
    const out = `${e.stderr || ''} ${e.stdout || ''} ${e.message || ''}`;
    // Não está em estado "failed" — ok
    if (
      out.includes('P3012') ||
      out.includes('There is no failed migration') ||
      out.includes('could not find') ||
      out.includes('not in a failed state')
    ) {
      return false;
    }
    console.log(`⚠️  migrate resolve --rolled-back ${migrationName}:`, out.trim().slice(0, 400));
    return false;
  }
}

/** Remove bloqueio P3009 causado por deploys antigos (migration falhou antes de existir dp_requests). */
function clearKnownFailedMigrationsFromHistory() {
  console.log('🔧 Verificando migrations conhecidas presas em estado falho (P3009)...');
  for (const name of MIGRATIONS_TRY_ROLLBACK_IF_FAILED) {
    tryRollbackFailedMigration(name);
  }
}

// Tenta importar Prisma Client, se não estiver disponível, gera primeiro
let PrismaClient;
let prisma;

try {
  PrismaClient = require('@prisma/client').PrismaClient;
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
} catch (error) {
  console.log('⚠️  Prisma Client não encontrado. Gerando...');
  try {
    execSync('npx prisma generate', {
      stdio: 'inherit',
      cwd: BACKEND_ROOT,
    });
    PrismaClient = require('@prisma/client').PrismaClient;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  } catch (genError) {
    console.error('❌ Erro ao gerar Prisma Client:', genError.message);
    process.exit(1);
  }
}

async function checkTableExists(tableName) {
  try {
    // Tenta fazer uma query simples na tabela
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "${tableName}" LIMIT 1`);
    return true;
  } catch (error) {
    // Se der erro de "table does not exist", a tabela não existe
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return false;
    }
    // Outro erro (pode ser que a tabela exista mas tenha outro problema)
    throw error;
  }
}

async function createManualInssTable() {
  try {
    console.log('📝 Criando tabela manual_inss_values...');
    
    // 1. Criar a tabela (sem IF NOT EXISTS para ver erro se já existir)
    const createTableSQL = `
      CREATE TABLE "manual_inss_values" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "month" INTEGER NOT NULL,
        "year" INTEGER NOT NULL,
        "inssRescisao" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "inss13" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "manual_inss_values_pkey" PRIMARY KEY ("id")
      )
    `;
    
    try {
      await prisma.$executeRawUnsafe(createTableSQL);
      console.log('✅ Tabela criada');
    } catch (tableError) {
      // Se a tabela já existe, continua
      if (tableError.message.includes('already exists') || tableError.code === '42P07') {
        console.log('✅ Tabela já existe');
      } else {
        throw tableError;
      }
    }
    
    // 2. Criar índice único (se não existir)
    try {
      const createIndexSQL = `
        CREATE UNIQUE INDEX IF NOT EXISTS "manual_inss_values_employeeId_month_year_key" 
        ON "manual_inss_values"("employeeId", "month", "year")
      `;
      await prisma.$executeRawUnsafe(createIndexSQL);
      console.log('✅ Índice único criado');
    } catch (indexError) {
      // Índice pode já existir, não é crítico
      console.log('⚠️  Índice pode já existir, continuando...');
      console.log('   Detalhes:', indexError.message);
    }
    
    // 3. Adicionar foreign key (se não existir)
    try {
      const checkConstraintSQL = `
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'manual_inss_values_employeeId_fkey'
        LIMIT 1
      `;
      const constraintExists = await prisma.$queryRawUnsafe(checkConstraintSQL);
      
      if (!constraintExists || constraintExists.length === 0) {
        const addConstraintSQL = `
          ALTER TABLE "manual_inss_values" 
          ADD CONSTRAINT "manual_inss_values_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE
        `;
        await prisma.$executeRawUnsafe(addConstraintSQL);
        console.log('✅ Foreign key criada');
      } else {
        console.log('✅ Foreign key já existe');
      }
    } catch (constraintError) {
      // Constraint pode já existir, não é crítico
      console.log('⚠️  Foreign key pode já existir, continuando...');
      console.log('   Detalhes:', constraintError.message);
    }
    
    // Verifica se a tabela realmente foi criada
    const tableExists = await checkTableExists('manual_inss_values');
    if (tableExists) {
      console.log('✅ Tabela manual_inss_values criada e verificada com sucesso!');
      return true;
    } else {
      console.error('❌ Tabela não foi criada mesmo após tentativa');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao criar tabela manual_inss_values:');
    console.error('   Mensagem:', error.message);
    console.error('   Código:', error.code);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function resolveFailedMigrations() {
  try {
    console.log('🔍 Verificando migrations falhadas...');
    
    // Verifica se a tabela manual_inss_values existe
    let tableExists = false;
    try {
      tableExists = await checkTableExists('manual_inss_values');
    } catch (error) {
      console.log('⚠️  Erro ao verificar tabela (pode ser problema de conexão):', error.message);
      // Desconecta e tenta novamente
      await prisma.$disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Aguarda 1 segundo
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      });
      tableExists = await checkTableExists('manual_inss_values');
    }
    
    if (!tableExists) {
      console.log('⚠️  Tabela manual_inss_values não encontrada. Criando...');
      const created = await createManualInssTable();
      if (created) {
        // Verifica novamente se a tabela foi criada
        tableExists = await checkTableExists('manual_inss_values');
        if (tableExists) {
          console.log('✅ Tabela criada com sucesso!');
        }
      } else {
        console.log('⚠️  Não foi possível criar a tabela automaticamente. Continuando...');
      }
    } else {
      console.log('✅ Tabela manual_inss_values já existe');
    }
    
    // Primeiro, tenta resolver a migration falhada ANTES de executar migrate deploy
    // Se a tabela existe, significa que as tabelas foram criadas, então marca como applied
    // Se não existe, marca como rolled_back para tentar aplicar novamente
    const migrationName = '20251105105343_init';
    
    if (tableExists) {
      console.log(`📝 Tabelas já existem. Marcando migration '${migrationName}' como aplicada...`);
      try {
        execSync(`npx prisma migrate resolve --applied ${migrationName}`, {
          stdio: 'inherit',
          cwd: BACKEND_ROOT,
        });
        console.log('✅ Migration marcada como aplicada');
      } catch (applyError) {
        const out = `${applyError.stderr || ''} ${applyError.stdout || ''} ${applyError.message || ''}`;
        // P3008 = já consta como aplicada — não fazer rolled-back (isso corrompe o histórico e o deploy).
        if (out.includes('P3008') || out.includes('already recorded as applied')) {
          console.log('✅ Init já estava aplicada (P3008). Seguindo sem alterar o histórico.');
        } else {
          console.log('⚠️  migrate resolve --applied falhou:', out.trim().slice(0, 400));
          console.log('⚠️  Não usamos rolled-back automático (evita estado inconsistente no Railway).');
        }
      }
    } else {
      console.log(`📝 Tabela não existe. Marcando migration '${migrationName}' como rolled back...`);
      try {
        execSync(`npx prisma migrate resolve --rolled-back ${migrationName}`, {
          stdio: 'inherit',
          cwd: BACKEND_ROOT,
        });
        console.log('✅ Migration marcada como rolled back');
      } catch (resolveError) {
        console.log('⚠️  Não foi possível marcar como rolled back:', resolveError.message);
        // Continua mesmo assim
      }
    }
    
    // Desconecta ANTES de executar migrate deploy para liberar conexões
    await prisma.$disconnect();
    await new Promise(resolve => setTimeout(resolve, 500)); // Aguarda 500ms para garantir desconexão

    clearKnownFailedMigrationsFromHistory();

    // Agora tenta executar migrate deploy
    try {
      console.log('🔄 Executando prisma migrate deploy...');
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        cwd: BACKEND_ROOT,
      });
      console.log('✅ Migrations aplicadas com sucesso');
      return true;
    } catch (error) {
      const errorOutput = (error.stdout?.toString() || error.stderr?.toString() || error.message || '').trim();

      if (errorOutput.includes('P3009') || errorOutput.includes('failed migrations')) {
        console.log('⚠️  P3009: tentando liberar migrations conhecidas e repetir deploy...');
        clearKnownFailedMigrationsFromHistory();
        try {
          execSync('npx prisma migrate deploy', {
            stdio: 'inherit',
            cwd: BACKEND_ROOT,
          });
          console.log('✅ Migrations aplicadas com sucesso (após recuperação)');
          return true;
        } catch (retryErr) {
          console.error('❌ migrate deploy falhou após recuperação:', retryErr.message);
          return false;
        }
      }

      console.error('❌ Erro ao executar migrate deploy:', errorOutput.substring(0, 500));
      return false;
    }
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    return false;
  } finally {
    // Sempre desconecta antes de sair
    try {
      await prisma.$disconnect();
      console.log('✅ Conexão Prisma fechada');
      // Aguarda um pouco para garantir que a conexão foi fechada
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (disconnectError) {
      console.log('⚠️  Erro ao desconectar (não crítico):', disconnectError.message);
    }
  }
}

// Executa o script
resolveFailedMigrations()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

