# 🚀 Guia de Otimização do Backend

## 📖 O que é Otimização de Backend?

**Otimização de backend** significa melhorar o desempenho, eficiência e escalabilidade do servidor da sua aplicação. O objetivo é fazer com que o backend:

- ⚡ **Responda mais rápido** às requisições
- 💰 **Use menos recursos** (CPU, memória, banco de dados)
- 📈 **Suporte mais usuários** simultaneamente
- 🔒 **Seja mais seguro** e confiável
- 📊 **Tenha melhor monitoramento** e logs

---

## 🎯 Por que Otimizar?

### Problemas Comuns sem Otimização:

1. **Lentidão**: Usuários esperam muito tempo por respostas
2. **Sobrecarga**: Servidor fica lento ou cai com muitos usuários
3. **Custos Altos**: Precisa de servidores maiores/melhores
4. **Experiência Ruim**: Usuários desistem de usar o sistema
5. **Problemas de Escala**: Não consegue crescer

### Benefícios da Otimização:

✅ Respostas mais rápidas (melhor UX)  
✅ Menor custo de infraestrutura  
✅ Sistema mais estável e confiável  
✅ Melhor capacidade de crescimento  
✅ Menor consumo de recursos  

---

## 🔍 Áreas de Otimização

### 1. **Otimização de Queries no Banco de Dados**

#### Problema: Queries Lentas ou N+1

**O que é N+1?**
- Fazer 1 query para buscar uma lista
- Depois fazer N queries (uma para cada item da lista)
- Exemplo: Buscar 100 usuários, depois fazer 100 queries para buscar o employee de cada um

**Solução: Usar `include` ou `select` do Prisma**

❌ **Código Ruim (N+1):**
```typescript
const users = await prisma.user.findMany();
// Para cada usuário, faz uma query separada
for (const user of users) {
  const employee = await prisma.employee.findUnique({
    where: { userId: user.id }
  });
}
```

✅ **Código Bom (1 query):**
```typescript
const users = await prisma.user.findMany({
  include: {
    employee: true // Busca tudo em uma query
  }
});
```

**Exemplo no seu código:**

```66:111:sistema-de-ponto-gennesis/apps/backend/src/controllers/UserController.ts
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                department: true,
                position: true,
                hireDate: true,
                birthDate: true,
                salary: true,
                isRemote: true,
                workSchedule: true,
                costCenter: true,
                client: true,
                // Novos campos
                company: true,
                bank: true,
                accountType: true,
                agency: true,
                operation: true,
                account: true,
                digit: true,
                pixKeyType: true,
                pixKey: true,
                dailyFoodVoucher: true,
                dailyTransportVoucher: true,
                modality: true,
                familySalary: true,
                dangerPay: true,
                unhealthyPay: true,
                // Novos campos - Polo e Categoria Financeira
                polo: true,
                categoriaFinanceira: true,
                // Campo para controlar se precisa bater ponto
                requiresTimeClock: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);
```

✅ **Já está otimizado!** Usa `include` e `Promise.all` para buscar dados e contagem em paralelo.

---

### 2. **Índices no Banco de Dados**

**O que são índices?**
- Estruturas que aceleram buscas no banco
- Como um índice de livro: você não precisa ler tudo para encontrar algo

**Como adicionar índices no Prisma:**

```prisma
model TimeRecord {
  id          String        @id @default(cuid())
  userId      String
  employeeId  String
  timestamp   DateTime      @default(now())
  type        TimeRecordType
  
  // Índices para acelerar buscas
  @@index([userId, timestamp])  // Busca por usuário e data
  @@index([employeeId, timestamp]) // Busca por funcionário e data
  @@index([type, timestamp]) // Busca por tipo e data
  @@map("time_records")
}
```

**Verifique seu schema.prisma** - alguns modelos já têm índices:
- `Holiday` tem `@@index([date])`
- `Chat` tem `@@index([initiatorId])`
- `Message` tem `@@index([chatId])`

---

### 3. **Paginação**

**Por que paginar?**
- Evita buscar milhares de registros de uma vez
- Reduz uso de memória e tempo de resposta

✅ **Já implementado no seu código:**

```497:580:sistema-de-ponto-gennesis/apps/backend/src/controllers/TimeRecordController.ts
  async getAllRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, userId, employeeId, startDate, endDate, type, isValid } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (userId) where.userId = userId;
      if (employeeId) where.employeeId = employeeId;
      if (type) where.type = type;
      if (isValid !== undefined) where.isValid = isValid === 'true';

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate)
```

**Dica:** Limite máximo de registros por página (ex: 1000) para evitar sobrecarga.

---

### 4. **Cache**

**O que é cache?**
- Armazenar dados frequentemente acessados em memória
- Evita buscar no banco repetidamente

**Exemplos de dados para cache:**
- Configurações da empresa (raramente mudam)
- Lista de feriados
- Dados de dashboard (atualizar a cada X minutos)

**Implementação simples com cache em memória:**

```typescript
// lib/cache.ts
const cache = new Map<string, { data: any; expiresAt: number }>();

export function getCache(key: string) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

export function setCache(key: string, data: any, ttlSeconds: number = 300) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
}

// Uso no controller
export class CompanyController {
  async getSettings(req: AuthRequest, res: Response) {
    const cached = getCache('company_settings');
    if (cached) {
      return res.json({ success: true, data: cached });
    }
    
    const settings = await prisma.companySettings.findFirst();
    setCache('company_settings', settings, 300); // Cache por 5 minutos
    res.json({ success: true, data: settings });
  }
}
```

**Para produção, considere:**
- **Redis** (cache distribuído)
- **node-cache** (biblioteca simples)

---

### 5. **Promise.all para Queries Paralelas**

**Quando usar?**
- Quando precisa buscar vários dados independentes
- Em vez de fazer sequencialmente (lento), faz em paralelo (rápido)

✅ **Já está sendo usado no seu código:**

```59:161:sistema-de-ponto-gennesis/apps/backend/src/routes/dashboard.ts
    const [totalEmployees, presentUsers, allTodayRecords, employeesWithoutTimeClock, absentUsers] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
        }
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          type: { in: ['ENTRY', 'LUNCH_END'] },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { userId: true, type: true },
      }),
      // Buscar funcionários que não precisam bater ponto (excluindo administradores)
      prisma.user.findMany({
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE',
          isActive: true,
          id: { in: userIds },
          AND:
```

**Exemplo de comparação:**

❌ **Sequencial (lento):**
```typescript
const users = await prisma.user.count();
const employees = await prisma.employee.count();
const records = await prisma.timeRecord.count();
// Total: ~300ms (100ms cada)
```

✅ **Paralelo (rápido):**
```typescript
const [users, employees, records] = await Promise.all([
  prisma.user.count(),
  prisma.employee.count(),
  prisma.timeRecord.count()
]);
// Total: ~100ms (todos ao mesmo tempo)
```

---

### 6. **Connection Pooling**

**O que é?**
- Reutilizar conexões com o banco de dados
- Evita abrir/fechar conexões constantemente

✅ **Já configurado no seu código:**

```1:36:sistema-de-ponto-gennesis/apps/backend/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

// Configurar DATABASE_URL com connection pool limit se não tiver
let databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl && !databaseUrl.includes('connection_limit')) {
  // Adiciona connection_limit se não existir
  const separator = databaseUrl.includes('?') ? '&' : '?';
  databaseUrl = `${databaseUrl}${separator}connection_limit=5&pool_timeout=10`;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl || process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
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

export { prisma };
```

**Dica:** Ajuste `connection_limit` conforme o plano do seu banco de dados.

---

### 7. **Compression (Compressão)**

**O que faz?**
- Comprime respostas HTTP (JSON, HTML, etc.)
- Reduz tamanho da resposta em ~70%
- Mais rápido para o cliente baixar

✅ **Já está configurado:**

```128:128:sistema-de-ponto-gennesis/apps/backend/src/index.ts
app.use(compression());
```

---

### 8. **Rate Limiting**

**O que faz?**
- Limita número de requisições por IP
- Protege contra abuso e ataques
- Evita sobrecarga do servidor

✅ **Já está configurado:**

```130:179:sistema-de-ponto-gennesis/apps/backend/src/index.ts
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
```

---

### 9. **Select Específico (Não buscar campos desnecessários)**

**Por que?**
- Reduz quantidade de dados transferidos
- Mais rápido para o banco processar

✅ **Já está sendo usado:**

```71:107:sistema-de-ponto-gennesis/apps/backend/src/controllers/UserController.ts
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                department: true,
                position: true,
                hireDate: true,
                birthDate: true,
                salary: true,
                isRemote: true,
                workSchedule: true,
                costCenter: true,
                client: true,
                // Novos campos
                company: true,
                bank: true,
                accountType: true,
                agency: true,
                operation: true,
                account: true,
                digit: true,
                pixKeyType: true,
                pixKey: true,
                dailyFoodVoucher: true,
                dailyTransportVoucher: true,
                modality: true,
                familySalary: true,
                dangerPay: true,
                unhealthyPay: true,
                // Novos campos - Polo e Categoria Financeira
                polo: true,
                categoriaFinanceira: true,
                // Campo para controlar se precisa bater ponto
                requiresTimeClock: true,
              }
            }
          },
```

**Comparação:**

❌ **Buscar tudo:**
```typescript
const user = await prisma.user.findUnique({
  where: { id: userId }
  // Busca TODOS os campos, incluindo password, tokens, etc.
});
```

✅ **Buscar só o necessário:**
```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    name: true,
    email: true
    // Só os campos que precisa
  }
});
```

---

### 10. **Validação e Sanitização**

**Por que?**
- Evita processar dados inválidos
- Protege contra SQL injection (Prisma já protege)
- Melhora segurança

**Exemplo com Joi:**

```typescript
import Joi from 'joi';

const createUserSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  cpf: Joi.string().pattern(/^\d{11}$/).required()
});

export async function createUser(req: AuthRequest, res: Response) {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      message: error.details[0].message 
    });
  }
  // Usar value (dados validados e sanitizados)
}
```

---

## 📊 Checklist de Otimização

### ✅ Já Implementado no Seu Projeto:

- [x] Connection pooling configurado
- [x] Compression habilitado
- [x] Rate limiting configurado
- [x] Paginação em listagens
- [x] Promise.all para queries paralelas
- [x] Select específico em alguns endpoints
- [x] Include para evitar N+1 em alguns lugares
- [x] Helmet para segurança
- [x] Error handling centralizado

### 🔧 Melhorias Recomendadas:

- [ ] **Adicionar cache** para dados que mudam pouco (feriados, configurações)
- [ ] **Adicionar mais índices** no schema.prisma para campos frequentemente buscados
- [ ] **Otimizar queries lentas** identificadas com logs do Prisma
- [ ] **Implementar validação** com Joi em todos os endpoints
- [ ] **Adicionar monitoramento** (logs estruturados, métricas)
- [ ] **Otimizar uploads** (comprimir imagens antes de salvar)
- [ ] **Implementar background jobs** para tarefas pesadas (ex: geração de relatórios)

---

## 🛠️ Como Identificar Problemas de Performance

### 1. **Habilitar Logs de Query do Prisma**

```typescript
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'], // Em desenvolvimento
});
```

Isso mostra todas as queries executadas e quanto tempo levaram.

### 2. **Usar Ferramentas de Profiling**

- **Node.js Inspector**: `node --inspect dist/index.js`
- **Clinic.js**: `npm install -g clinic && clinic doctor -- node dist/index.js`
- **0x**: `npm install -g 0x && 0x dist/index.js`

### 3. **Monitorar Métricas**

- Tempo de resposta das requisições
- Uso de CPU e memória
- Número de conexões com o banco
- Taxa de erros

### 4. **Testes de Carga**

Use ferramentas como:
- **Apache Bench (ab)**: `ab -n 1000 -c 10 http://localhost:5000/api/users`
- **Artillery**: `npm install -g artillery && artillery quick --count 10 --num 100 http://localhost:5000/api/users`
- **k6**: Ferramenta moderna de teste de carga

---

## 📈 Exemplo Prático: Otimizar Endpoint de Dashboard

### Antes (Lento):

```typescript
async function getDashboard(req: AuthRequest, res: Response) {
  // Busca sequencial - LENTO
  const totalEmployees = await prisma.user.count();
  const presentUsers = await prisma.user.findMany({ /* ... */ });
  const records = await prisma.timeRecord.findMany({ /* ... */ });
  const holidays = await prisma.holiday.findMany({ /* ... */ });
  
  // Sem cache - busca do banco toda vez
  const settings = await prisma.companySettings.findFirst();
  
  res.json({ totalEmployees, presentUsers, records, holidays, settings });
}
```

### Depois (Rápido):

```typescript
async function getDashboard(req: AuthRequest, res: Response) {
  // Busca paralela - RÁPIDO
  const [totalEmployees, presentUsers, records, holidays] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({ /* ... */ }),
    prisma.timeRecord.findMany({ /* ... */ }),
    prisma.holiday.findMany({ /* ... */ })
  ]);
  
  // Com cache - busca do banco só se necessário
  let settings = getCache('company_settings');
  if (!settings) {
    settings = await prisma.companySettings.findFirst();
    setCache('company_settings', settings, 300); // Cache por 5 minutos
  }
  
  res.json({ totalEmployees, presentUsers, records, holidays, settings });
}
```

**Resultado:** De ~500ms para ~150ms (3x mais rápido!)

---

## 🎓 Resumo

**Otimização de backend** é fazer o servidor trabalhar de forma mais eficiente:

1. **Queries inteligentes**: Evitar N+1, usar índices, paginar
2. **Paralelismo**: Usar Promise.all quando possível
3. **Cache**: Armazenar dados que mudam pouco
4. **Compressão**: Reduzir tamanho das respostas
5. **Rate limiting**: Proteger contra abuso
6. **Validação**: Evitar processar dados inválidos
7. **Monitoramento**: Identificar gargalos

**Lembre-se:** Otimização prematura pode ser ruim. Primeiro meça, depois otimize onde realmente precisa!

---

## 📚 Recursos Adicionais

- [Prisma Performance](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express Performance](https://expressjs.com/en/advanced/best-practice-performance.html)

