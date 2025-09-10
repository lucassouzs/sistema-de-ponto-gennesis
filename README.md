# Sistema de Controle de Ponto - Empresa de Engenharia

## 📋 Visão Geral

Sistema completo para controle de frequência de colaboradores com:
- Bater ponto com foto e geolocalização
- Cálculos automáticos de horas extras, banco de horas e férias
- Painel administrativo completo
- Versão web e mobile

## 🏗️ Arquitetura

### Estrutura do Projeto (Monorepo)
```
sistema-ponto-engenharia/
├── apps/
│   ├── backend/          # API Node.js + Express + PostgreSQL
│   ├── frontend/         # React + Next.js (Web)
│   └── mobile/           # React Native (Mobile)
├── packages/
│   ├── shared/           # Código compartilhado
│   └── types/            # TypeScript types
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

## 📅 Cronograma de Desenvolvimento (12-16 semanas)

### Fase 1: Planejamento e Configuração (1-2 semanas)
- [x] Estrutura do projeto
- [ ] Configuração do banco de dados
- [ ] Setup do backend
- [ ] Setup do frontend
- [ ] Setup do mobile

### Fase 2: Autenticação e Usuários (2-3 semanas)
- [ ] Sistema de autenticação JWT
- [ ] CRUD de usuários
- [ ] Perfis de usuário (colaborador, admin, RH)
- [ ] Middleware de autorização

### Fase 3: Sistema de Ponto (3-4 semanas)
- [ ] Captura de foto
- [ ] Geolocalização
- [ ] Validações de ponto
- [ ] Histórico de pontos
- [ ] Relatórios de frequência

### Fase 4: Cálculos e Regras de Negócio (3-4 semanas)
- [ ] Cálculo de horas trabalhadas
- [ ] Horas extras
- [ ] Banco de horas
- [ ] Cálculo de férias
- [ ] Faltas e atrasos

### Fase 5: Painel Administrativo (2-3 semanas)
- [ ] Dashboard principal
- [ ] Gestão de colaboradores
- [ ] Relatórios avançados
- [ ] Configurações da empresa

### Fase 6: Testes e Deploy (1-2 semanas)
- [ ] Testes automatizados
- [ ] Deploy em produção
- [ ] Documentação final
- [ ] Treinamento dos usuários

## 🛠️ Como Executar

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### Instalação
```bash
# Clone o repositório
git clone <url-do-repositorio>
cd sistema-ponto-engenharia

# Instale todas as dependências
npm run install:all

# Configure as variáveis de ambiente
cp apps/backend/.env.example apps/backend/.env
# Edite o arquivo .env com suas configurações

# Execute o banco de dados
npm run db:migrate

# Inicie o desenvolvimento
npm run dev
```

### URLs de Desenvolvimento
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Mobile**: Expo Dev Tools

## 📱 Funcionalidades

### Para Colaboradores
- Bater ponto com foto e localização
- Visualizar histórico de pontos
- Consultar saldo de horas
- Solicitar férias

### Para Administradores
- Dashboard com métricas
- Gestão de colaboradores
- Relatórios de frequência
- Configurações da empresa
- Aprovação de solicitações

### Para RH
- Relatórios detalhados
- Cálculos de folha de pagamento
- Gestão de férias
- Análise de produtividade

## 🔒 Segurança

- Autenticação JWT
- Validação de geolocalização
- Upload seguro de fotos
- Logs de auditoria
- Criptografia de dados sensíveis

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
