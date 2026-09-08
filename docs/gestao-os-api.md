# API — Gestão de OS (Manutenção Predial)

Base: `/api/gestao-os`  
Auth: JWT (`Authorization: Bearer …`)  
Uso interno Gennesis (single-tenant). Capacidades vêm das **permissões de Controle**, não de perfis por empresa.

## Permissões (Controle → Gestão de OS)

| Permissão | Libera |
|-----------|--------|
| Gestão de OS (módulo) | Ver / abrir chamados |
| Cadastros Gestão de OS | Locais, ativos, planos, documentos |
| Analisar / aprovar OS | Em análise, aprovar, cancelar, atribuir |
| Executar OS | Execução / aguardando peça / concluir |
| Encerrar / avaliar OS | Encerrar e avaliar |

## Acesso

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/me` | Flags de permissão (`canAnalisar`, `canExecutar`, …) |
| GET | `/summary` | Contagens por status (+ overdue) |
| GET | `/locations` | Árvore prédio → setor → local → ativo |
| GET | `/technicians` | Técnicos da empresa |
| GET | `/` | Lista de chamados/OS |
| POST | `/` | Abrir chamado |
| GET | `/:id` | Detalhe |
| PATCH | `/:id` | Atualizar campos |
| POST | `/:id/transition` | Mudar status |
| POST | `/upload-attachment` | Upload (multipart `file`) |

### Status

`OPEN → UNDER_REVIEW → APPROVED → IN_PROGRESS ↔ WAITING_PARTS → COMPLETED → CLOSED` (+ `CANCELLED`)

Campos extras na OS: `dueAt`, `checklistResponses`, `signatureRequesterUrl`, `signatureTechnicianUrl`.

## Planos / PMOC / Checklists

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/plans` | Listar / criar plano preventivo, PMOC ou SAFETY |
| PATCH | `/plans/:id` | Atualizar plano |
| POST | `/plans/generate-due` | Gera OS para planos com `nextDueAt` vencido |
| GET | `/pmoc` | Visão PMOC (planos + ativos de climatização) |
| GET/POST | `/checklists` | Templates de checklist |

## Documentos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/documents` | Listar (filtros `buildingId`, `assetId`, `kind`) |
| POST | `/documents` | Cadastrar documento (manual, garantia, laudo, ART…) |
| DELETE | `/documents/:id` | Remover (gestor) |

## Relatórios

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/reports/summary` | Backlog, overdue, MTTR, por categoria/prédio/técnico |

## Cadastros

Prefixo `/cadastros/*` — empresas, filiais, prédios, setores, locais, ativos (QR), prestadores, categorias, memberships, settings.

## UI web

- `/ponto/sistema-gestao-os` — chamados/OS
- `/ponto/sistema-gestao-os/planos` — planos preventivos
- `/ponto/sistema-gestao-os/pmoc` — PMOC
- `/ponto/sistema-gestao-os/relatorios` — indicadores
- `/ponto/sistema-gestao-os/cadastros` — cadastros

## App mobile

Menu **Gestão de OS**: lista atribuídas, detalhe com checklist/transições, abertura via token QR do ativo.
