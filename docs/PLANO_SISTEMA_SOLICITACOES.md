# 📋 Sistema de Solicitações - Correção de Ponto

## 🎯 Visão Geral

Sistema integrado para solicitações de correção de ponto, onde funcionários podem solicitar alterações em seus registros de ponto através de uma modal na página principal de controle de ponto.

## 🏗️ Arquitetura do Sistema

### **📱 Frontend - Funcionário (Modal)**
- **Localização**: Botão na página "Controle de Ponto"
- **Interface**: Modal com lista de solicitações + botão "Nova Solicitação"
- **Funcionalidades**:
  - Visualizar todas as suas solicitações
  - Criar nova solicitação de correção
  - Acompanhar status das solicitações

### **👨‍💼 Frontend - Supervisores/RH (Página Dedicada)**
- **Localização**: Página separada `/ponto/gerenciar-solicitacoes`
- **Modelo**: Similar às páginas "Registrar Ausência" e "Gerenciar Ausência"
- **Funcionalidades**:
  - Visualizar todas as solicitações pendentes
  - Aprovar/rejeitar solicitações
  - Adicionar comentários
  - Filtrar por departamento/funcionário

## 🗄️ Estrutura do Banco de Dados

### **Tabela Principal**
```sql
CREATE TABLE point_correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  justification TEXT NOT NULL,
  
  -- Dados originais (incorretos)
  original_date DATE NOT NULL,
  original_time TIME NOT NULL,
  original_type VARCHAR(20) NOT NULL CHECK (original_type IN ('ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT')),
  
  -- Dados corrigidos (solicitados)
  corrected_date DATE NOT NULL,
  corrected_time TIME NOT NULL,
  corrected_type VARCHAR(20) NOT NULL CHECK (corrected_type IN ('ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT')),
  
  -- Status e aprovação
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  -- Metadados
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Tabelas Auxiliares**
```sql
-- Anexos (comprovantes, fotos, etc.)
CREATE TABLE point_correction_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES point_correction_requests(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Comentários (funcionário e supervisor)
CREATE TABLE point_correction_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES point_correction_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- TRUE = apenas para supervisores
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔄 Fluxo de Trabalho

### **1. Funcionário Cria Solicitação**
1. Acessa página "Controle de Ponto"
2. Clica no botão "Solicitações"
3. Abre modal com lista de suas solicitações
4. Clica em "Nova Solicitação"
5. Preenche formulário com:
   - Título da solicitação
   - Descrição do problema
   - Justificativa detalhada
   - Data/hora original (incorreta)
   - Data/hora corrigida (solicitada)
   - Tipo de ponto (entrada, saída, etc.)
6. Anexa comprovantes (opcional)
7. Submete solicitação

### **2. Supervisor/RH Gerencia**
1. Acessa página "Gerenciar Solicitações"
2. Visualiza lista de solicitações pendentes
3. Pode filtrar por:
   - Departamento
   - Funcionário
   - Período
   - Status
4. Para cada solicitação pode:
   - Visualizar detalhes completos
   - Adicionar comentários internos
   - Aprovar ou rejeitar
   - Solicitar mais informações

### **3. Aprovação/Rejeição**
- **Aprovada**: Status muda para "APPROVED", sistema aplica correção automaticamente
- **Rejeitada**: Status muda para "REJECTED", funcionário é notificado com motivo

## 🎨 Interface do Usuário

### **Modal de Solicitações (Funcionário)**
```
┌─────────────────────────────────────┐
│ Solicitações de Correção de Ponto  │
├─────────────────────────────────────┤
│ [Nova Solicitação]                  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📝 Correção Entrada - 15/10    │ │
│ │ Status: Pendente                │ │
│ │ Data: 15/10/2024 08:30 → 08:15  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ✅ Correção Saída - 14/10      │ │
│ │ Status: Aprovada               │ │
│ │ Data: 14/10/2024 18:00 → 17:45 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### **Página de Gerenciamento (Supervisor)**
```
┌─────────────────────────────────────────────────────────┐
│ Gerenciar Solicitações de Correção de Ponto             │
├─────────────────────────────────────────────────────────┤
│ Filtros: [Departamento ▼] [Funcionário ▼] [Período ▼]   │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ João Silva - Correção Entrada                       │ │
│ │ Departamento: Engenharia | Data: 15/10/2024         │ │
│ │ Original: 08:30 → Corrigido: 08:15                 │ │
│ │ [Aprovar] [Rejeitar] [Ver Detalhes]                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Maria Santos - Correção Saída                      │ │
│ │ Departamento: Administrativo | Data: 14/10/2024    │ │
│ │ Original: 18:00 → Corrigido: 17:45                │ │
│ │ [Aprovar] [Rejeitar] [Ver Detalhes]                │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 🔐 Permissões e Acessos

### **Funcionários (Todos os cargos)**
- ✅ Visualizar suas próprias solicitações
- ✅ Criar novas solicitações
- ✅ Cancelar solicitações pendentes
- ❌ Ver solicitações de outros funcionários
- ❌ Aprovar/rejeitar solicitações

### **Supervisores/RH (Coordenador, Supervisor, Gerente, Diretor)**
- ✅ Visualizar todas as solicitações
- ✅ Filtrar por departamento/funcionário
- ✅ Aprovar/rejeitar solicitações
- ✅ Adicionar comentários internos
- ✅ Acessar página de gerenciamento

## 🚀 Implementação por Fases

### **Fase 1: Backend e Modal Básica**
- [x] Modelos de dados (Prisma)
- [x] Controller e rotas básicas
- [ ] Modal na página "Controle de Ponto"
- [ ] Formulário de nova solicitação
- [ ] Lista de solicitações do funcionário

### **Fase 2: Página de Gerenciamento**
- [ ] Página `/ponto/gerenciar-solicitacoes`
- [ ] Interface para supervisores
- [ ] Funcionalidades de aprovação/rejeição
- [ ] Sistema de comentários

### **Fase 3: Integração e Melhorias**
- [ ] Aplicação automática de correções aprovadas
- [ ] Notificações por email
- [ ] Relatórios e métricas
- [ ] Validações avançadas

## 📊 Regras de Negócio

### **Validações**
- Funcionário só pode solicitar correções para seus próprios registros
- Não é possível solicitar correção para registros futuros
- Justificativa deve ter pelo menos 20 caracteres
- Data corrigida não pode ser mais de 30 dias no futuro

### **Limitações**
- Máximo 5 solicitações pendentes por funcionário
- Solicitações antigas (mais de 90 dias) são automaticamente canceladas
- Supervisor só pode aprovar solicitações de seu departamento (exceto RH/Gerência)

### **Auditoria**
- Todas as ações são registradas com timestamp e usuário
- Histórico completo de alterações de status
- Logs de aprovação/rejeição com motivos

## 🔗 Integração com Sistema Existente

### **Página Controle de Ponto**
- Adicionar botão "Solicitações" no header
- Modal integrada com design consistente
- Notificações visuais para solicitações pendentes

### **Sidebar**
- Manter item "Solicitações" para acesso direto
- Adicionar item "Gerenciar Solicitações" para supervisores

### **Sistema de Ponto**
- Aplicar correções automaticamente quando aprovadas
- Manter histórico de alterações
- Integrar com relatórios de banco de horas
