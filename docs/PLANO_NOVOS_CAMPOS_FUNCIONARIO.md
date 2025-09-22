# Plano de Implementação - Novos Campos no Cadastro de Funcionário

## Resumo
Este documento descreve a implementação de novos campos bancários e contratuais no cadastro de funcionários do sistema de controle de ponto.

## Novos Campos a serem Adicionados

### 1. Dados da Empresa e Contrato
- **EMPRESA** (enum/select)
  - ABRASIL
  - GÊNNESIS
  - MÉTRICA

- **CONTRATO ATUAL** (enum/select)
  - Será populado dinamicamente com os mesmos itens do CENTRO DE CUSTO
  - Exemplos esperados: "PROJETO A", "PROJETO B", "CLIENTE X", etc.

### 2. Dados Bancários
- **BANCO** (enum/select)
  - BANCO DO BRASIL
  - BRADESCO
  - C6
  - CAIXA ECONÔMICA
  - CEF
  - INTER
  - ITAÚ
  - NUBANK
  - PICPAY
  - SANTANDER

- **TIPO DE CONTA** (enum/select)
  - CONTA SALÁRIO
  - CONTA CORRENTE
  - POUPANÇA

- **AGÊNCIA** (string)
  - Campo de texto para número da agência

- **OP.** (string)
  - Campo de texto para operação

- **CONTA** (string)
  - Campo de texto para número da conta

- **DIGITO** (string)
  - Campo de texto para dígito verificador

### 3. Dados PIX
- **TIPO DE CHAVE** (enum/select)
  - ALEATÓRIA
  - CELULAR
  - CNPJ
  - CPF
  - E-MAIL

- **CHAVE PIX** (string)
  - Campo de texto para a chave PIX

## Estrutura de Implementação

### 1. Schema do Banco de Dados (Prisma)
```prisma
model Employee {
  // ... campos existentes ...
  
  // Novos campos
  company            String?  // EMPRESA
  currentContract    String?  // CONTRATO ATUAL
  bank               String?  // BANCO
  accountType        String?  // TIPO DE CONTA
  agency             String?  // AGÊNCIA
  operation          String?  // OP.
  account            String?  // CONTA
  digit              String?  // DIGITO
  pixKeyType         String?  // TIPO DE CHAVE
  pixKey             String?  // CHAVE PIX
}
```

### 2. Enums TypeScript
```typescript
enum Company {
  ABRASIL = 'ABRASIL',
  GENNESIS = 'GÊNNESIS',
  METRICA = 'MÉTRICA'
}

enum Bank {
  BANCO_DO_BRASIL = 'BANCO DO BRASIL',
  BRADESCO = 'BRADESCO',
  C6 = 'C6',
  CAIXA_ECONOMICA = 'CAIXA ECONÔMICA',
  CEF = 'CEF',
  INTER = 'INTER',
  ITAU = 'ITAÚ',
  NUBANK = 'NUBANK',
  PICPAY = 'PICPAY',
  SANTANDER = 'SANTANDER'
}

enum AccountType {
  CONTA_SALARIO = 'CONTA SALÁRIO',
  CONTA_CORRENTE = 'CONTA CORRENTE',
  POUPANCA = 'POUPANÇA'
}

enum PixKeyType {
  ALEATORIA = 'ALEATÓRIA',
  CELULAR = 'CELULAR',
  CNPJ = 'CNPJ',
  CPF = 'CPF',
  EMAIL = 'E-MAIL'
}
```

### 3. Alterações no Backend

#### 3.1 Schema Prisma
- Adicionar novos campos no modelo `Employee`
- Criar migration para adicionar as colunas no banco

#### 3.2 Controllers
- **EmployeeController**: Atualizar métodos de criação e edição
- Validar novos campos conforme regras de negócio
- Atualizar DTOs/interfaces

#### 3.3 Validações
- **EMPRESA**: Obrigatório, deve ser uma das opções válidas
- **CONTRATO ATUAL**: Obrigatório, deve existir na lista de centros de custo
- **BANCO**: Obrigatório se dados bancários forem preenchidos
- **AGÊNCIA/CONTA/DIGITO**: Obrigatórios se banco for informado
- **CHAVE PIX**: Validar formato conforme tipo de chave selecionado

### 4. Alterações no Frontend

#### 4.1 Formulário de Cadastro/Edição
- Nova seção "Dados Bancários e Contratuais"
- Campos organizados em grupos lógicos:
  - Dados da Empresa
  - Dados Bancários
  - Dados PIX

#### 4.2 Componentes
- Select components para campos com opções fixas
- Campo de texto para CONTRATO ATUAL (populado dinamicamente)
- Validação em tempo real dos campos obrigatórios

#### 4.3 Layout
```
┌─ Dados da Empresa ───────────────────┐
│ EMPRESA: [Select]                    │
│ CONTRATO ATUAL: [Select dinâmico]    │
└──────────────────────────────────────┘

┌─ Dados Bancários ────────────────────┐
│ BANCO: [Select]                      │
│ TIPO DE CONTA: [Select]              │
│ AGÊNCIA: [Input] OP.: [Input]        │
│ CONTA: [Input] DIGITO: [Input]       │
└──────────────────────────────────────┘

┌─ Dados PIX ──────────────────────────┐
│ TIPO DE CHAVE: [Select]              │
│ CHAVE PIX: [Input]                   │
└──────────────────────────────────────┘
```

### 5. Fluxo de Dados

#### 5.1 Carregamento do CONTRATO ATUAL
- Buscar centros de custo existentes no sistema
- Popular select com essas opções
- Permitir adição de novos contratos se necessário

#### 5.2 Validação de PIX
- **CPF**: Validar formato de CPF
- **CNPJ**: Validar formato de CNPJ
- **CELULAR**: Validar formato de telefone
- **E-MAIL**: Validar formato de email
- **ALEATÓRIA**: Aceitar qualquer string

### 6. Impactos em Outras Funcionalidades

#### 6.1 Relatórios
- Incluir novos campos nos relatórios de funcionários
- Filtros por empresa e contrato

#### 6.2 Exports
- Adicionar novos campos nas exportações (Excel, PDF)

#### 6.3 APIs
- Atualizar endpoints de listagem e detalhamento
- Incluir novos campos nas respostas

### 7. Ordem de Implementação

1. **Backend**
   - Atualizar schema Prisma
   - Criar migration
   - Atualizar controllers e validações
   - Atualizar seed com dados de exemplo

2. **Frontend**
   - Criar/atualizar componentes de formulário
   - Implementar validações
   - Integrar com APIs atualizadas

3. **Testes**
   - Testar cadastro com novos campos
   - Testar validações
   - Testar edição de funcionários existentes

### 8. Considerações Técnicas

#### 8.1 Migração de Dados Existentes
- Funcionários existentes terão campos nulos inicialmente
- Permitir edição posterior para preenchimento

#### 8.2 Segurança
- Dados bancários são sensíveis - considerar criptografia
- Logs de auditoria para alterações

#### 8.3 Performance
- Novos campos não impactam consultas existentes
- Índices podem ser necessários para filtros por empresa

## Conclusão

Esta implementação adicionará funcionalidades importantes para gestão de funcionários, especialmente para folha de pagamento e dados contratuais. Os campos foram organizados de forma lógica e as validações garantem a integridade dos dados.
