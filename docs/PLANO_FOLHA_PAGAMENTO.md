# Plano de Implementação - Página de Folha de Pagamento

## Resumo
Este documento descreve a implementação da página de folha de pagamento para administradores, com funcionalidades para visualizar e gerenciar informações salariais dos funcionários.

## Fase 1: Estrutura Básica da Página

### 1.1 Página Principal
- **Rota**: `/admin/folha-pagamento`
- **Acesso**: Apenas ADMIN
- **Layout**: Página administrativa com header e sidebar

### 1.2 Lista Inicial de Funcionários (Fase 1 - Implementada)
**Colunas básicas:**
- **Nome**: Nome completo do funcionário
- **Função**: Cargo/posição do funcionário
- **Setor**: Departamento onde trabalha

### 1.3 Lista Expandida de Funcionários (Fase 1.5 - Atual)
**Colunas adicionais implementadas:**
- **Empresa**: ABRASIL, GÊNNESIS, MÉTRICA
- **Centro de Custo**: Centro de custo do funcionário
- **Contrato Atual**: Projeto/contrato atual
- **Tomador**: Cliente/empresa tomadora
- **CPF**: CPF do funcionário
- **Banco**: Banco do funcionário
- **Tipo de Conta**: CONTA SALÁRIO, CONTA CORRENTE, POUPANÇA
- **Agência**: Número da agência
- **OP.**: Operação bancária
- **Conta**: Número da conta
- **Digito**: Dígito verificador
- **Tipo de Chave**: ALEATÓRIA, CELULAR, CNPJ, CPF, E-MAIL
- **Chave Pix**: Chave PIX do funcionário
- **VA (DIÁRIO)**: Vale Alimentação diário em R$
- **VT (DIÁRIO)**: Vale Transporte diário em R$

**Características:**
- Tabela responsiva com scroll horizontal
- Paginação (se necessário)
- Filtros básicos (nome, setor, empresa)
- Busca por texto
- Ordenação por colunas

## Fase 2: Folha de Pagamento Mensal (Atual)

### 2.1 Filtros de Período
- **Filtro de Mês**: Seleção de mês (1-12)
- **Filtro de Ano**: Seleção de ano (2020-2030)
- **Período Padrão**: Mês e ano atual
- **Validação**: Não permitir períodos futuros

### 2.2 Colunas de Totais Mensais
- **TOTAL VA**: Soma de todos os valores de Vale Alimentação recebidos no mês
- **TOTAL VT**: Soma de todos os valores de Vale Transporte recebidos no mês
- **Cálculo**: Baseado nos registros de ponto do funcionário no período selecionado

### 2.3 Estrutura da Tabela Mensal
**Colunas existentes + novas:**
- **Nome**: Nome completo do funcionário
- **Função**: Cargo/posição do funcionário
- **Salário**: Salário base do funcionário em R$
- **Setor**: Departamento onde trabalha
- **Empresa**: ABRASIL, GÊNNESIS, MÉTRICA
- **Centro de Custo**: Centro de custo do funcionário
- **Contrato Atual**: Projeto/contrato atual
- **Tomador**: Cliente/empresa tomadora
- **CPF**: CPF do funcionário
- **Banco**: Banco do funcionário
- **Tipo de Conta**: CONTA SALÁRIO, CONTA CORRENTE, POUPANÇA
- **Agência**: Número da agência
- **OP.**: Operação bancária
- **Conta**: Número da conta
- **Digito**: Dígito verificador
- **Tipo de Chave**: ALEATÓRIA, CELULAR, CNPJ, CPF, E-MAIL
- **Chave Pix**: Chave PIX do funcionário
- **VA (DIÁRIO)**: Vale Alimentação diário em R$ (valor padrão)
- **VT (DIÁRIO)**: Vale Transporte diário em R$ (valor padrão)
- **TOTAL VA**: Total de VA recebido no mês selecionado
- **TOTAL VT**: Total de VT recebido no mês selecionado

## Fase 3: Funcionalidades Avançadas (Futuras)

### 3.1 Colunas Adicionais (Futuras)
- **Matrícula**: ID do funcionário
- **Salário Base**: Valor do salário
- **Data Admissão**: Quando foi contratado

### 3.2 Funcionalidades de Folha
- **Cálculo de Salários**: Base + extras + descontos
- **Horas Extras**: Cálculo automático
- **Descontos**: INSS, IRRF, etc.
- **Benefícios**: VA, VT, etc.
- **Exportação**: PDF, Excel
- **Histórico**: Mês a mês

### 2.3 Relatórios
- **Resumo Mensal**: Total de funcionários, salários
- **Por Empresa**: Divisão por ABRASIL/GÊNNESIS/MÉTRICA
- **Por Setor**: Análise por departamento
- **Comparativo**: Mês anterior vs atual

## Estrutura de Implementação

### 3.1 Backend (APIs)
```typescript
// Endpoint para folha de pagamento mensal
GET /api/payroll/employees
- Lista funcionários com dados para folha
- Filtros: empresa, setor, status, mês, ano
- Paginação e ordenação

GET /api/payroll/employees/monthly
- Lista funcionários com totais mensais de VA/VT
- Parâmetros: month, year, company?, department?
- Calcula totais baseado nos registros de ponto

GET /api/payroll/employee/:id
- Dados completos de um funcionário
- Histórico salarial
- Cálculos de folha

POST /api/payroll/calculate
- Calcular folha para período específico
- Processar horas extras
- Aplicar descontos e benefícios
```

### 3.2 Frontend (Componentes)
```typescript
// Página principal
PayrollPage.tsx
- Header com filtros e ações
- Filtros de mês/ano
- Tabela de funcionários
- Paginação

// Componentes específicos
EmployeePayrollTable.tsx
- Tabela com dados dos funcionários
- Colunas configuráveis (incluindo TOTAL VA/VT)
- Ações por linha

PayrollFilters.tsx
- Filtros por empresa, setor, período
- Filtros de mês e ano
- Busca por nome
- Ordenação

PayrollActions.tsx
- Botões de exportação
- Cálculo de folha
- Relatórios

MonthlyTotals.tsx
- Componente para exibir totais mensais
- Resumo de VA/VT por funcionário
```

### 3.3 Tipos TypeScript
```typescript
interface PayrollEmployee {
  id: string;
  name: string;
  position: string;
  department: string;
  employeeId: string;
  company: string;
  currentContract: string;
  baseSalary: number;
  hireDate: string;
  // Dados bancários
  bank: string;
  accountType: string;
  agency: string;
  account: string;
  digit: string;
  pixKeyType: string;
  pixKey: string;
  // Valores diários
  dailyFoodVoucher: number;
  dailyTransportVoucher: number;
  // Totais mensais
  totalFoodVoucher: number;
  totalTransportVoucher: number;
}

interface PayrollFilters {
  search: string;
  company: string;
  department: string;
  month: number;
  year: number;
}

interface MonthlyPayrollData {
  employees: PayrollEmployee[];
  period: {
    month: number;
    year: number;
    monthName: string;
  };
  totals: {
    totalEmployees: number;
    totalFoodVoucher: number;
    totalTransportVoucher: number;
  };
}
```

## Layout da Página

### 4.1 Header
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Folha de Pagamento                    [Filtros] [Exportar] │
├─────────────────────────────────────────────────────────────┤
│ 🔍 [Busca] [Empresa ▼] [Setor ▼] [Mês ▼] [Ano ▼] [Calcular] │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Tabela (Fase 1 - Implementada)
```
┌─────────────────────────────────────────────────────────────┐
│ Nome                    │ Função        │ Setor             │
├─────────────────────────────────────────────────────────────┤
│ João Silva              │ Engenheiro    │ Engenharia Civil  │
│ Maria Santos            │ Analista      │ Recursos Humanos  │
│ Pedro Oliveira          │ Arquiteto     │ Engenharia Civil  │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Tabela (Fase 2 - Atual - Folha Mensal)
```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Nome        │ Função      │ Salário     │ Setor           │ Empresa  │ Centro Custo │ Contrato Atual │ Tomador      │ CPF              │ VA (DIÁRIO) │ VT (DIÁRIO) │ TOTAL VA │ TOTAL VT │
├─────────────┼─────────────┼─────────────┼─────────────────┼──────────┼──────────────┼────────────────┼──────────────┼──────────────────┼─────────────┼─────────────┼──────────┼──────────┤
│ João Silva  │ Engenheiro  │ R$ 8.000,00 │ Eng. Civil      │ GÊNNESIS │ PROJ A       │ PROJ ELÉTRICO  │ Cliente X    │ 123.456.789-01   │ R$ 33,40    │ R$ 11,00    │ R$ 668,00│ R$ 220,00│
│ Maria Santos│ Analista    │ R$ 5.500,00 │ Recursos Humanos│ ABRASIL  │ PROJ B       │ PROJ CIVIL     │ Cliente Y    │ 987.654.321-00   │ R$ 33,40    │ R$ 11,00    │ R$ 601,20│ R$ 198,00│
└─────────────┴─────────────┴─────────────┴─────────────────┴──────────┴──────────────┴────────────────┴──────────────┴──────────────────┴─────────────┴─────────────┴──────────┴──────────┘
```

**Legenda:**
- **Salário**: Salário base do funcionário
- **VA (DIÁRIO)**: Valor diário padrão de Vale Alimentação
- **VT (DIÁRIO)**: Valor diário padrão de Vale Transporte  
- **TOTAL VA**: Soma total de VA recebido no mês selecionado
- **TOTAL VT**: Soma total de VT recebido no mês selecionado

### 4.4 Tabela (Fase 3 - Futura)
```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Nome    │ Matrícula │ Função    │ Setor     │ Empresa  │ Salário  │ Banco      │ PIX        │ Ações │
├─────────┼───────────┼───────────┼───────────┼──────────┼──────────┼────────────┼────────────┼───────┤
│ João... │ EMP001    │ Engenheiro│ Eng. Civil│ GÊNNESIS │ R$ 8.000 │ BB         │ CPF        │ [📊]  │
└─────────┴───────────┴───────────┴───────────┴──────────┴──────────┴────────────┴────────────┴───────┘
```

## Funcionalidades de Segurança

### 5.1 Controle de Acesso
- **Apenas ADMIN**: Página restrita a administradores
- **Logs de Auditoria**: Registrar acessos e alterações
- **Dados Sensíveis**: Mascarar informações em logs

### 5.2 Proteção de Dados
- **Dados Bancários**: Criptografia no banco
- **PIX**: Mascarar chaves em exibições
- **Exportação**: Controle de acesso aos arquivos

## Considerações Técnicas

### 6.1 Performance
- **Paginação**: Limitar resultados por página
- **Índices**: Otimizar queries no banco
- **Cache**: Cache de dados frequentes

### 6.2 Responsividade
- **Mobile**: Tabela adaptável para telas pequenas
- **Tablet**: Layout otimizado para tablets
- **Desktop**: Experiência completa

### 6.3 Acessibilidade
- **ARIA**: Labels e descrições adequadas
- **Navegação**: Suporte a teclado
- **Contraste**: Cores adequadas para leitura

## Ordem de Implementação

### Fase 1 (Concluída)
1. ✅ Criar página `/admin/folha-pagamento`
2. ✅ Implementar lista básica (Nome, Função, Setor)
3. ✅ Filtros básicos e busca
4. ✅ Paginação simples

### Fase 1.5 (Concluída)
1. ✅ Adicionar colunas: Empresa, Centro de Custo, Contrato Atual, Tomador, CPF
2. ✅ Implementar tabela responsiva com scroll horizontal
3. ✅ Atualizar filtros para incluir empresa
4. ✅ Testar funcionalidade completa

### Fase 2 (Atual - Folha Mensal)
1. 🔄 Implementar filtros de mês e ano
2. 🔄 Adicionar colunas TOTAL VA e TOTAL VT
3. 🔄 Criar endpoint para calcular totais mensais
4. 🔄 Atualizar interface com novos filtros
5. 🔄 Implementar cálculo baseado em registros de ponto

### Fase 3 (Futura)
1. Adicionar colunas de dados bancários
2. Implementar cálculos de folha
3. Funcionalidades de exportação
4. Relatórios e dashboards

### Fase 4 (Futura)
1. Integração com sistema de ponto
2. Cálculo automático de horas extras
3. Histórico de folhas
4. Notificações e alertas

## Detalhes da Implementação Mensal

### 5.1 Cálculo dos Totais Mensais
```typescript
// Lógica para calcular TOTAL VA e TOTAL VT
const calculateMonthlyTotals = async (employeeId: string, month: number, year: number) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const timeRecords = await prisma.timeRecord.findMany({
    where: {
      employeeId,
      timestamp: {
        gte: startDate,
        lte: endDate
      },
      type: 'ENTRY' // Apenas entradas para contar dias trabalhados
    }
  });
  
  const totalVA = timeRecords.reduce((sum, record) => 
    sum + (record.foodVoucherAmount || 0), 0
  );
  
  const totalVT = timeRecords.reduce((sum, record) => 
    sum + (record.transportVoucherAmount || 0), 0
  );
  
  return { totalVA, totalVT, daysWorked: timeRecords.length };
};
```

### 5.2 Validações
- **Período válido**: Não permitir meses futuros
- **Funcionário ativo**: Apenas funcionários admitidos antes ou durante o período aparecem na folha
- **Dados existentes**: Verificar se há registros de ponto no período
- **Valores padrão**: Usar valores diários do funcionário se não houver registros específicos

### 5.3 Performance
- **Cache**: Cache dos totais calculados por 1 hora
- **Índices**: Índice composto em (employeeId, timestamp) na tabela time_records
- **Paginação**: Limitar a 50 funcionários por página

## Conclusão

Esta implementação será feita de forma incremental, começando com uma lista simples e evoluindo para um sistema completo de folha de pagamento mensal. A arquitetura modular permite adicionar funcionalidades gradualmente sem impactar o sistema existente. A nova funcionalidade de folha mensal permitirá aos administradores visualizar os totais de VA e VT recebidos por cada funcionário em um período específico, facilitando o controle financeiro e a gestão de benefícios.
