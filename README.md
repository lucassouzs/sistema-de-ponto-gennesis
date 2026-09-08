# Gennesis — Plataforma de Gestão Empresarial

## 📋 Visão Geral

Plataforma integrada da Gennesis para gestão do dia a dia de uma empresa de engenharia, reunindo em um único sistema:

- **Departamento Pessoal** — funcionários, folha, férias, ausências, banco de horas e registros de ponto
- **Engenharia e obras** — contratos, ordens de serviço, materiais, pleitos, fichas de demanda e central de chamados
- **Suprimentos** — requisições, cotações, ordens de compra, estoque, frota e abastecimento
- **Financeiro e métricas** — controle de NFs, receitas, gastos por contrato e balanço financeiro
- **Contratos e licitações** — espelho de NF, PNCP, responsáveis técnicos (CREA), anuidades e ART/protocolos
- **Jurídico** — processos trabalhistas e dashboards de acompanhamento
- **Aprovações e integrações** — Fluig, solicitações internas, chat e central de ajuda

Acesso por perfil e permissão por módulo, com versão web e app mobile.

## 🏗️ Arquitetura

### Estrutura do Projeto (Monorepo)
```
sistema-de-ponto-gennesis/
├── apps/
│   ├── backend/          # API Node.js + Express + PostgreSQL
│   ├── frontend/         # React + Next.js (Web)
│   └── mobile/           # React Native (Mobile)
├── packages/
│   ├── permission-modules/  # Módulos e permissões compartilhados
│   └── ...
└── docs/                 # Documentação
```

## 🚀 Tecnologias

### Backend
- **Node.js** + **Express**
- **PostgreSQL** + **PostGIS** (geolocalização)
- **Prisma** (ORM)
- **JWT** (autenticação)
- **Multer** (upload de fotos)
- **AWS S3** (armazenamento)

### Frontend Web
- **React** + **Next.js**
- **TypeScript**
- **Tailwind CSS**
- **React Query** (cache)
- **React Hook Form**

### Mobile
- **React Native**
- **Expo**
- **React Navigation**
- **React Native Camera**
- **React Native Geolocation**

## 🛠️ Como Executar

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### Instalação
```bash
# Clone o repositório
git clone <url-do-repositorio>
cd sistema-de-ponto-gennesis

# Instale todas as dependências
npm run install:all

# Configure as variáveis de ambiente
copy apps\backend\env.example apps\backend\.env
# Edite o arquivo .env com suas configurações

# Execute o banco de dados
cd apps\backend
npm run db:migrate

# Execute para criar os dados iniciais
npm run db:seed

# Inicie o desenvolvimento
npm run dev
```

### URLs de Desenvolvimento
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Mobile**: Expo Dev Tools

## 📱 Funcionalidades

### Principal
- Painel do sistema, caixa de aprovações e integração com Fluig
- Solicitações internas, reserva de frota, abastecimento e chamados de manutenção
- Central de ajuda com tutoriais do sistema

### Departamento Pessoal
- Cadastro de funcionários e externos, folha de pagamento e ausências
- Férias, alterações de ponto, banco de horas e alocação
- Segurança do trabalho (ASO) e central de atendimentos (WhatsApp)

### Engenharia
- Contratos, ordens de serviço, solicitação de materiais e pleitos
- Fichas de demanda, recebimento de entregas e solicitação de ferramentas
- Central de chamados, planos de manutenção e relatórios

### Suprimentos
- Requisições de materiais, mapa de cotação e ordens de compra
- Controle de entregas, estoque e furo de estoque
- Fila de abastecimento, gestão da frota e pedidos de ferramentas

### Financeiro e métricas
- Controle financeiro, receitas e pagamento da folha (borderô/CNAB)
- Controle de NFs, entrada fiscal e balanço por contrato
- Gastos operacionais e visão consolidada de contratos

### Contratos, licitações e jurídico
- Espelho de NF, licitações e consulta PNCP
- Responsáveis técnicos, anuidades CREA e ART/protocolos
- Processos trabalhistas e dashboards jurídicos

### Registros de ponto (web e mobile)
- Bater ponto com foto e geolocalização
- Histórico de registros, banco de horas e solicitações relacionadas

## 🔒 Segurança

- Autenticação JWT
- Validação de geolocalização
- Upload seguro de fotos
- Logs de auditoria
- Criptografia de dados sensíveis
- Permissões granulares por módulo e cargo

## 📊 Regras de Negócio

### Horário de Trabalho
- Jornada padrão: 8h/dia, 44h/semana
- Horário de almoço: 1h (não contabilizada)
- Tolerância de atraso: 10 minutos

### Horas Extras
- Acima de 8h/dia: 50% adicional
- Acima de 44h/semana: 50% adicional
- Domingos e feriados: 100% adicional

### Banco de Horas
- Compensação em até 6 meses
- Máximo de 2h extras por dia para banco
- Conversão em dinheiro se não compensado

### Férias
- 30 dias por ano
- Período aquisitivo: 12 meses
- Período concessivo: 12 meses
- 1/3 constitucional

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.
