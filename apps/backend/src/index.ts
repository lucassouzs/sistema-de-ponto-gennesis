// Carregar variáveis de ambiente PRIMEIRO (antes de qualquer outro import do app).
import './loadEnv';
import path from 'path';
import dotenv from 'dotenv';

// Mantém path explícito (compatível com execuções que não passam por loadEnv).
dotenv.config({ path: path.join(__dirname, '../.env') });

// Log de configuração das variáveis de ambiente
console.log('🔧 Configuração carregada:');
console.log(`   📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
console.log(`   🗄️  Database: ${process.env.DATABASE_URL ? '✅ Configurada' : '❌ Não configurada'}`);
console.log(`   🔐 JWT Secret: ${process.env.JWT_SECRET ? '✅ Configurada' : '❌ Não configurada'}`);
console.log(`   ☁️  AWS S3: ${process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
console.log(`   📦 Bucket: ${process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos'}`);
console.log(`   📊 Fluig API: ${process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN ? '✅ Configurado' : '❌ Não configurado'}`);
const totvsRmOk =
  !!(process.env.TOTVS_RM_BASE_URL || '').trim() &&
  (!!(process.env.TOTVS_RM_BEARER_TOKEN || '').trim() ||
    (!!(process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim() &&
      !!(process.env.TOTVS_RM_PASSWORD || '').trim()));
console.log(`   📈 TOTVS RM (RELATORIOFIN): ${totvsRmOk ? '✅ Configurado' : '❌ Não configurado'}`);
const nfeJava =
  process.env.NFE_JAVA_ENABLED === '1' || process.env.NFE_JAVA_ENABLED === 'true';
const nfeXml = !!(process.env.NFE_XML_DIR || '').trim();
console.log(
  `   🧾 NFs Recebidas: ${
    nfeJava ? '✅ SEFAZ (Java)' : nfeXml ? '✅ pasta XML' : '❌ não configurado'
  }`
);
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
import { persistentUploadsS3Fallback } from './lib/persistentUpload';
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
import asoRoutes from './routes/aso';
import chatRoutes from './routes/chats';
import costCenterRoutes from './routes/costCenters';
import serviceOrderRoutes from './routes/serviceOrders';
import contractRoutes from './routes/contracts';
import constructionMaterialRoutes from './routes/constructionMaterials';
import borderRoutes from './routes/border';
import materialRequestRoutes from './routes/materialRequests';
import financialAnalysisRoutes from './routes/financialAnalysis';
import financialControlRoutes from './routes/financialControl';
import extratoCaixaRoutes from './routes/extratoCaixa';
import controleNfsRoutes from './routes/controleNfs';
import nfeRecebidasRoutes from './routes/nfeRecebidas';
import controleGeralRoutes from './routes/controleGeral';
import supplierRoutes from './routes/suppliers';
import responsaveisTecnicosRoutes from './routes/responsaveisTecnicos';
import controleAnuidadeRoutes from './routes/controleAnuidade';
import controlePagamentoArtRoutes from './routes/controlePagamentoArt';
import financeiroReceitasRoutes from './routes/financeiroReceitas';
import vehicleRoutes from './routes/vehicles';
import vehicleReservationRoutes from './routes/vehicleReservations';
import toolRentalRequestRoutes from './routes/toolRentalRequests';
import paymentConditionRoutes from './routes/paymentConditions';
import purchaseOrderRoutes from './routes/purchaseOrders';
import budgetNatureRoutes from './routes/budgetNatures';
import orcamentoRoutes from './routes/orcamento';
import pleitoRoutes from './routes/pleitos';
import demandSheetApprovalRoutes from './routes/demandSheetApprovals';
import fluigRoutes from './routes/fluig';
import { fluigService } from './controllers/FluigController';
import whatsappRoutes from './routes/whatsapp';
import quoteMapRoutes from './routes/quoteMaps';
import permissionRoutes from './routes/permissions';
import stockRoutes from './routes/stock';
import espelhoNfRoutes from './routes/espelhoNf';
import driveRoutes from './routes/drive';
import relatoriosFotograficosRoutes from './routes/relatorios-fotograficos';
import reunioesRoutes from './routes/reunioes';
import orcafascioRoutes from './routes/orcafascio';
import callHistoryRoutes from './routes/callHistory';
import kanbanRoutes from './routes/kanban';
import plannerEventsRoutes from './routes/plannerEvents';
import plannerTasksRoutes from './routes/plannerTasks';
import flowRoutes from './routes/flow';
import helpTutorialsRoutes from './routes/helpTutorials';
import materialDeliveryRoutes from './routes/materialDeliveries';
import fuelRefuelRequestRoutes from './routes/fuelRefuelRequests';
import fuelGasStationRoutes from './routes/fuelGasStations';
import logisticsDeliveryRequestRoutes from './routes/logisticsDeliveryRequests';
import gestaoOsRoutes from './routes/gestaoOs';
import approvalsRoutes from './routes/approvals';
import licitacoesRoutes from './routes/licitacoes';
import pncpRoutes from './routes/pncp';
import { startPncpSyncScheduler } from './services/PncpIngestService';
import { startNfeAutoFetchScheduler } from './services/NfeRecebidaAutoFetch';
import { ensureNfeSecretsFromEnv } from './lib/ensureNfeSecretsFromEnv';
import { logNfeRuntimeStatus } from './services/NfeRecebidaService';
import { LicitacaoController } from './controllers/LicitacaoController';
import { authenticate, AuthRequest } from './middleware/auth';
import { removeOrphanUserPermissions } from './lib/permissionRegistrySync';
import { getPrismaPoolConfig, prisma } from './lib/prisma';
import { getPasswordHashImplementation } from './lib/passwordHash';
import { ensureProductionSchema } from './lib/ensureProductionSchema';
import { attachCallSignaling } from './realtime/wsCallSignaling';

ensureNfeSecretsFromEnv();
logNfeRuntimeStatus();

const licitacaoExtraCtrl = new LicitacaoController();

// Sem isto, uma rejeição solta (ex.: worker externo ausente) encerra o processo no Node 18.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});

const prismaPool = getPrismaPoolConfig();
console.log('🚀 Iniciando aplicação...');
console.log('   📦 Deploy trigger: 2026-07-13-login-opts');
console.log(`   🔐 Password hashing: ${getPasswordHashImplementation()}`);
console.log(
  `   🗄️  Prisma pool: connection_limit=${prismaPool.connectionLimit}, pool_timeout=${prismaPool.poolTimeout}s`,
);

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
  'https://www.gennesisconecta.com.br',
  'https://gennesisconecta.com.br',
  'https://sistema-pontofrontend-production.up.railway.app',
  'https://sistema-pontobackend-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:19006'
];

function isTrustedAppOrigin(origin: string): boolean {
  return (
    origin.includes('gennesisconecta.com.br') ||
    origin.includes('railway.app') ||
    origin.includes('localhost')
  );
}

// Função para verificar se a origem é permitida
const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Permitir requisições sem origem (ex: Postman)
  if (isTrustedAppOrigin(origin)) return true;
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
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
  ],
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
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma'
      );
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

/** Rate limit só em deploy real (local/HMR não deve bloquear /auth/me). */
const enableRateLimit =
  process.env.NODE_ENV === 'production' ||
  process.env.RAILWAY_ENVIRONMENT === 'production';

const rateLimit429Handler = (
  req: import('express').Request,
  res: import('express').Response,
  message: string,
) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('gennesisconecta.com.br') || origin.includes('railway.app') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(429).json({ success: false, message });
};

/** Em desenvolvimento local não aplicamos rate limit (evita 429 com HMR + polling do chat). */
const skipRateLimit = (req: import('express').Request) =>
  req.method === 'OPTIONS' || !enableRateLimit;

// Rate limiting geral (uma única instância — antes havia duas contando em dobro)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: enableRateLimit ? 2000 : 50_000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  handler: (req, res) =>
    rateLimit429Handler(
      req,
      res,
      'Muitas tentativas de acesso. Tente novamente em 15 minutos.',
    ),
});

// /auth/me é consultado por vários componentes React — limite dedicado mais alto
const authMeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: enableRateLimit ? 300 : 10_000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipRateLimit,
  handler: (req, res) =>
    rateLimit429Handler(
      req,
      res,
      'Muitas consultas ao perfil. Aguarde um momento e recarregue a página.',
    ),
});

// Limite dedicado contra brute-force em login (só conta falhas)
const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: enableRateLimit ? 20 : 10_000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipRateLimit,
  handler: (req, res) =>
    rateLimit429Handler(
      req,
      res,
      'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
    ),
});

app.use(limiter);
app.use('/api/auth/me', authMeLimiter);
app.use('/api/auth/login', authLoginLimiter);

// Logging
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sempre servir ficheiros gravados em disco (RM, OC/boleto, mensagens, etc.).
// O uso de S3 para fotos de ponto não impede estes anexos locais.
// Depois do static: se o arquivo sumiu do disco do Railway, busca no S3 (mesmo path).
app.use('/uploads', express.static(backendUploadsRoot));
app.use('/uploads', persistentUploadsS3Fallback());

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
app.use('/api/aso', asoRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/cost-centers', costCenterRoutes);
app.use('/api/service-orders', serviceOrderRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/construction-materials', constructionMaterialRoutes);
app.use('/api/border', borderRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/api/financial-analysis', financialAnalysisRoutes);
app.use('/api/financial-control', financialControlRoutes);
app.use('/api/extrato-caixa', extratoCaixaRoutes);
app.use('/api/controle-nfs', controleNfsRoutes);
app.use('/api/nfe-recebidas', nfeRecebidasRoutes);
/** Teto orçamentário mensal (Controle Geral de Contratos). */
app.use('/api/controle-geral', controleGeralRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/responsaveis-tecnicos', responsaveisTecnicosRoutes);
app.use('/api/controle-anuidade', controleAnuidadeRoutes);
app.use('/api/controle-pagamentos-art', controlePagamentoArtRoutes);
app.use('/api/financeiro-receitas', financeiroReceitasRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/vehicle-reservations', vehicleReservationRoutes);
app.use('/api/tool-rental-requests', toolRentalRequestRoutes);
app.use('/api/payment-conditions', paymentConditionRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/quote-maps', quoteMapRoutes);
app.use('/api/budget-natures', budgetNatureRoutes);
app.use('/api/orcamento', orcamentoRoutes);
app.use('/api/pleitos', pleitoRoutes);
app.use('/api/demand-sheet-approvals', demandSheetApprovalRoutes);
app.use('/api/fluig', fluigRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/espelho-nf', espelhoNfRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/relatorios-fotograficos', relatoriosFotograficosRoutes);
app.use('/api/reunioes', reunioesRoutes);
app.use('/api/orcafascio', orcafascioRoutes);
app.use('/api/call-history', callHistoryRoutes);
app.use('/api/kanban', kanbanRoutes);
app.use('/api/planner-events', plannerEventsRoutes);
app.use('/api/planner-tasks', plannerTasksRoutes);
app.use('/api/flow', flowRoutes);
app.use('/api/help-tutorials', helpTutorialsRoutes);
app.use('/api/material-deliveries', materialDeliveryRoutes);
app.use('/api/fuel-refuel-requests', fuelRefuelRequestRoutes);
app.use('/api/fuel-gas-stations', fuelGasStationRoutes);
app.use('/api/logistics-delivery-requests', logisticsDeliveryRequestRoutes);
app.use('/api/gestao-os', gestaoOsRoutes);
app.use('/api/approvals', approvalsRoutes);
// Rotas explícitas de licitações (garantem checklist mesmo se o router interno estiver desatualizado)
app.get('/api/licitacoes/checklist-template', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.getChecklistTemplate(req as AuthRequest, res, next)
);
app.put('/api/licitacoes/checklist-template', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.updateChecklistTemplate(req as AuthRequest, res, next)
);
app.patch('/api/licitacoes/:id/analise-manual', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.updateAnaliseManual(req as AuthRequest, res, next)
);
app.patch('/api/licitacoes/:id/assumir-analise', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.assumirAnaliseManual(req as AuthRequest, res, next)
);
app.patch('/api/licitacoes/:id/liberar-analise', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.liberarAnaliseManual(req as AuthRequest, res, next)
);
app.patch('/api/licitacoes/:id/finalizar-analise', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.finalizarAnaliseManual(req as AuthRequest, res, next)
);
app.patch('/api/licitacoes/:id/arquivar', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.arquivarAnalise(req as AuthRequest, res, next)
);
app.patch('/api/licitacoes/:id/desarquivar', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.desarquivarAnalise(req as AuthRequest, res, next)
);
app.get('/api/licitacoes/:id/orcamento', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.getOrcamento(req as AuthRequest, res, next)
);
app.put('/api/licitacoes/:id/orcamento', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.saveOrcamento(req as AuthRequest, res, next)
);
app.get('/api/licitacoes/planilha-regioes', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.listRegiaoTabs(req as AuthRequest, res, next)
);
app.get('/api/licitacoes/planilha-regioes/:regiaoKey', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.getRegiaoSheet(req as AuthRequest, res, next)
);
app.post('/api/licitacoes/planilha-regioes/aceites', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.registrarAceiteRegiao(req as AuthRequest, res, next)
);
app.delete('/api/licitacoes/planilha-regioes/aceites', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.desfazerAceiteRegiao(req as AuthRequest, res, next)
);
app.post('/api/licitacoes/planilha-regioes/manuais', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.createManualRegiao(req as AuthRequest, res, next)
);
app.delete('/api/licitacoes/planilha-regioes/manuais', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.deleteManualRegiao(req as AuthRequest, res, next)
);
app.get('/api/licitacoes/banco-cats', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.getBancoCatsSheet(req as AuthRequest, res, next)
);
app.post('/api/licitacoes/banco-cats', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.createBancoCatsServico(req as AuthRequest, res, next)
);
app.delete('/api/licitacoes/banco-cats', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.deleteBancoCatsServico(req as AuthRequest, res, next)
);
app.get('/api/licitacoes/orcamento-line-template', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.getOrcamentoLineTemplate(req as AuthRequest, res, next)
);
app.put('/api/licitacoes/orcamento-line-template', authenticate, (req, res, next) =>
  licitacaoExtraCtrl.updateOrcamentoLineTemplate(req as AuthRequest, res, next)
);
app.use('/api/licitacoes', licitacoesRoutes);
app.use('/api/pncp', pncpRoutes);

// Middleware de erro 404
app.use(notFound);

// Middleware de tratamento de erros
app.use(errorHandler);

// Configurar timezone
process.env.TZ = 'America/Sao_Paulo';

// Iniciar servidor HTTP + WebSocket (sinalização de chamadas WebRTC)
try {
  const server = http.createServer(app);
  // Uploads grandes no Drive (vídeos ~GB) — sem cortar a conexão no meio
  const longMs = 6 * 60 * 60 * 1000;
  server.timeout = longMs;
  server.headersTimeout = longMs + 60_000;
  // Node 18+: 0 = sem limite de tempo da requisição
  (server as http.Server & { requestTimeout?: number }).requestTimeout = 0;
  attachCallSignaling(server);
  server.listen(PORT, '0.0.0.0', () => {
    void (async () => {
      try {
        await ensureProductionSchema(prisma);
        const { removed } = await removeOrphanUserPermissions();
        if (removed > 0) {
          console.log(`🧹 Permissões de módulos removidos do registro: ${removed} registro(s) limpo(s).`);
        }
      } catch (e) {
        console.error('Erro ao sincronizar permissões com o registro de módulos:', e);
      }

      try {
        const { DriveService } = await import('./services/DriveService');
        await new DriveService().ensureBucketCorsForBrowserUploads();
      } catch (e) {
        console.warn(
          '[drive] Não foi possível atualizar CORS do S3 (upload direto pode falhar):',
          e instanceof Error ? e.message : e,
        );
      }

      try {
        startPncpSyncScheduler();
      } catch (e) {
        console.error('[pncp-sync] falha ao agendar:', e);
      }

      try {
        startNfeAutoFetchScheduler();
      } catch (e) {
        console.error('[nfe-auto] falha ao agendar:', e);
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
    console.log('📋 Licitações: checklist-template + PATCH /:id/analise-manual + /:id/finalizar-analise ativos');
    console.log('═══════════════════════════════════════');
    console.log('');

    // Pré-aquecer os datasets Fluig em background para carregamento instantâneo
    if (process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN) {
      const FLUIG_APPROVAL_DATASETS = [
        'Processos_Workflow_Aprovacao_G3',
        'Processos_Workflow_Aprovacao_G5',
      ];
      // Aguarda 10s para o servidor estabilizar antes de chamar o Fluig
      setTimeout(() => {
        void fluigService.warmupDatasets(FLUIG_APPROVAL_DATASETS);
        fluigService.startPeriodicRefresh(FLUIG_APPROVAL_DATASETS, 8 * 60 * 1000);
      }, 10_000);
    }
  });
} catch (error) {
  console.error('❌ Erro ao iniciar servidor:', error);
  process.exit(1);
}

/** Hot-reload: MAPA NFS. */
export default app;
