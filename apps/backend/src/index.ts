// Carregar variáveis de ambiente PRIMEIRO, antes de qualquer importação
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Log de configuração das variáveis de ambiente
console.log('🔧 Configuração carregada:');
console.log(`   📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
console.log(`   🗄️  Database: ${process.env.DATABASE_URL ? '✅ Configurada' : '❌ Não configurada'}`);
console.log(`   🔐 JWT Secret: ${process.env.JWT_SECRET ? '✅ Configurada' : '❌ Não configurada'}`);
console.log(`   ☁️  AWS S3: ${process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
console.log(`   📦 Bucket: ${process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos'}`);
console.log(`   📊 Fluig API: ${process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN ? '✅ Configurado' : '❌ Não configurado'}`);
console.log('');

import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { backendUploadsRoot } from './lib/uploads';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import timeRecordRoutes from './routes/timeRecords';
import vacationRoutes from './routes/vacations';
import overtimeRoutes from './routes/overtime';
import reportRoutes from './routes/reports';
import companyRoutes from './routes/company';
import dashboardRoutes from './routes/dashboard';
import bankHoursRoutes from './routes/bankHours';
import medicalCertificateRoutes from './routes/medicalCertificates';
import payrollRoutes from './routes/payroll';
// import borderRoutes from './routes/border';
import salaryAdjustmentRoutes from './routes/salaryAdjustments';
import salaryDiscountRoutes from './routes/salaryDiscounts';
import pointCorrectionRoutes from './routes/pointCorrections';
import dpRequestsRoutes from './routes/dpRequests';
import holidayRoutes from './routes/holidays';
import chatRoutes from './routes/chats';
import costCenterRoutes from './routes/costCenters';
import contractRoutes from './routes/contracts';
import constructionMaterialRoutes from './routes/constructionMaterials';
import borderRoutes from './routes/border';
import materialRequestRoutes from './routes/materialRequests';
import financialAnalysisRoutes from './routes/financialAnalysis';
import supplierRoutes from './routes/suppliers';
import paymentConditionRoutes from './routes/paymentConditions';
import purchaseOrderRoutes from './routes/purchaseOrders';
import budgetNatureRoutes from './routes/budgetNatures';
import orcamentoRoutes from './routes/orcamento';
import pleitoRoutes from './routes/pleitos';
import fluigRoutes from './routes/fluig';
import whatsappRoutes from './routes/whatsapp';
import quoteMapRoutes from './routes/quoteMaps';
import permissionRoutes from './routes/permissions';
import driveRoutes from './routes/drive';
import relatoriosFotograficosRoutes from './routes/relatorios-fotograficos';
import orcafascioRoutes from './routes/orcafascio';
import { removeOrphanUserPermissions } from './lib/permissionRegistrySync';
import { prisma } from './lib/prisma';
import { ensureContractAddendaTable } from './lib/ensureContractAddendaSchema';
import { attachCallSignaling } from './realtime/wsCallSignaling';

console.log('🚀 Iniciando aplicação...');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Configurar trust proxy para funcionar corretamente com Railway/proxy reverso
// Confia apenas no primeiro proxy (Railway), não em todos os proxies
// Isso permite obter o IP real do cliente via X-Forwarded-For de forma segura
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT === 'production' ||
                     !process.env.NODE_ENV ||
                     !!process.env.PORT;

const allowedOrigins = [
  'https://sistema-pontofrontend-production.up.railway.app',
  'https://sistema-pontobackend-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:19006'
];

// Função para verificar se a origem é permitida
const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Permitir requisições sem origem (ex: Postman)
  if (origin.includes('railway.app') || origin.includes('localhost')) return true;
  return allowedOrigins.includes(origin);
};

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Em produção, permitir apenas origens específicas
    if (isProduction) {
      if (isOriginAllowed(origin)) {
        console.log('✅ Origem permitida pelo CORS:', origin);
        return callback(null, true);
      }
      console.error('❌ Origem não permitida pelo CORS:', origin);
      callback(new Error('Não permitido pelo CORS'));
    } else {
      // Em desenvolvimento, permitir todas as origens
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-Skipped-Order-Numbers'],
  optionsSuccessStatus: 204,
  preflightContinue: false
};

// Aplicar CORS ANTES de qualquer outro middleware
app.use(cors(corsOptions));

// Middleware adicional para garantir que requisições OPTIONS sejam tratadas corretamente
app.use((req, res, next) => {
  // Se for uma requisição OPTIONS, garantir que os headers CORS sejam enviados
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    } else {
      // Se a origem não for permitida, retornar 403
      return res.status(403).end();
    }
  }
  return next();
});

// Middleware de segurança - Configurado para não bloquear CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
// Rate limiter que ignora requisições OPTIONS (preflight CORS)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.',
  skip: (req) => req.method === 'OPTIONS', // Ignorar requisições OPTIONS
}));

// Rate limiting geral - ignorar requisições OPTIONS (preflight CORS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // máximo 1000 requests por IP (mais permissivo para desenvolvimento)
  message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Ignorar requisições OPTIONS (preflight)
  handler: (req, res) => {
    // Garantir que headers CORS sejam enviados mesmo quando rate limit é atingido
    const origin = req.headers.origin;
    if (origin && (origin.includes('railway.app') || origin.includes('localhost'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(429).json({
      success: false,
      message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.'
    });
  }
});

// Rate limiting mais permissivo para /auth/me (endpoint usado frequentemente)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por minuto por IP
  message: 'Muitas tentativas de acesso. Tente novamente em 1 minuto.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Ignorar requisições OPTIONS (preflight)
  handler: (req, res) => {
    // Garantir que headers CORS sejam enviados mesmo quando rate limit é atingido
    const origin = req.headers.origin;
    if (origin && (origin.includes('railway.app') || origin.includes('localhost'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(429).json({
      success: false,
      message: 'Muitas tentativas de acesso. Tente novamente em 1 minuto.'
    });
  }
});

app.use(limiter);

// Aplicar rate limiter mais permissivo para /auth/me antes das rotas
app.use('/api/auth/me', authLimiter);

// Logging
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sempre servir ficheiros gravados em disco (RM, OC/boleto, mensagens, etc.).
// O uso de S3 para fotos de ponto não impede estes anexos locais.
app.use('/uploads', express.static(backendUploadsRoot));

// Health check
app.get('/health', (req, res) => {
  console.log('🔍 Health check solicitado');
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    port: PORT,
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/time-records', timeRecordRoutes);
app.use('/api/vacations', vacationRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/bank-hours', bankHoursRoutes);
app.use('/api/medical-certificates', medicalCertificateRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/salary-adjustments', salaryAdjustmentRoutes);
app.use('/api/salary-discounts', salaryDiscountRoutes);
app.use('/api/solicitacoes', pointCorrectionRoutes);
app.use('/api/solicitacoes-dp', dpRequestsRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/cost-centers', costCenterRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/construction-materials', constructionMaterialRoutes);
app.use('/api/border', borderRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/api/financial-analysis', financialAnalysisRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/payment-conditions', paymentConditionRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/quote-maps', quoteMapRoutes);
app.use('/api/budget-natures', budgetNatureRoutes);
app.use('/api/orcamento', orcamentoRoutes);
app.use('/api/pleitos', pleitoRoutes);
app.use('/api/fluig', fluigRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/relatorios-fotograficos', relatoriosFotograficosRoutes);
app.use('/api/orcafascio', orcafascioRoutes);

// Middleware de erro 404
app.use(notFound);

// Middleware de tratamento de erros
app.use(errorHandler);

// Configurar timezone
process.env.TZ = 'America/Sao_Paulo';

// Iniciar servidor HTTP + WebSocket (sinalização de chamadas WebRTC)
try {
  const server = http.createServer(app);
  attachCallSignaling(server);
  server.listen(PORT, '0.0.0.0', () => {
    void (async () => {
      try {
        await ensureContractAddendaTable(prisma);
        const { removed } = await removeOrphanUserPermissions();
        if (removed > 0) {
          console.log(`🧹 Permissões de módulos removidos do registro: ${removed} registro(s) limpo(s).`);
        }
      } catch (e) {
        console.error('Erro ao sincronizar permissões com o registro de módulos:', e);
      }
    })();

    console.log('');
    console.log('🎉 SERVIDOR INICIADO COM SUCESSO!');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 Porta: ${PORT}`);
    console.log(`📊 Ambiente: ${process.env.NODE_ENV}`);
    console.log(`🌍 Timezone: ${process.env.TZ}`);
    console.log(`🔗 Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`🌐 API Base: http://0.0.0.0:${PORT}/api`);
    console.log('═══════════════════════════════════════');
    console.log('');
  });
} catch (error) {
  console.error('❌ Erro ao iniciar servidor:', error);
  process.exit(1);
}

export default app;
