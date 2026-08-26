/**
 * Registro central de módulos do sistema para permissões.
 * Cada item corresponde a um submenu (rota) — uma entrada na matriz “Acesso”.
 * Ação base no banco: `acesso` (libera o módulo). Módulos Contratos e Funcionários também
 * aceitam ações granulares: `ver`, `criar`, `editar`, `excluir` (ver `PERMISSION_MODULE_CRUD_ACTIONS`).
 */

export type PermissionModuleDef = {
  /** Identificador estável: derivado do href (ver pathToModuleKey). */
  key: string;
  name: string;
  href: string;
  /** Agrupamento na UI de permissões (ex.: mesmo bloco do menu lateral). */
  category: string;
  /**
   * Subtópico na aba Controle (ex.: «Ordem de Compra»).
   * Ignorado nas demais categorias da matriz Acesso.
   */
  group?: string;
};

/** Ação padrão de acesso a módulo (submenu). */
export const PERMISSION_ACCESS_ACTION = 'acesso' as const;
/** Ações CRUD granulares (contratos, funcionários, etc.). */
export const PERMISSION_MODULE_CRUD_ACTIONS = ['ver', 'criar', 'editar', 'excluir'] as const;
export type PermissionModuleCrudAction = (typeof PERMISSION_MODULE_CRUD_ACTIONS)[number];
/** @deprecated use PERMISSION_MODULE_CRUD_ACTIONS */
export const PERMISSION_CONTRACT_ACTIONS = PERMISSION_MODULE_CRUD_ACTIONS;
/** @deprecated use PermissionModuleCrudAction */
export type PermissionContractAction = PermissionModuleCrudAction;
export const PERMISSION_ACTIONS = [PERMISSION_ACCESS_ACTION, ...PERMISSION_MODULE_CRUD_ACTIONS] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Converte uma rota do app em chave de módulo (ex.: `/ponto/folha-pagamento` → `ponto_folha-pagamento`). */
export function pathToModuleKey(href: string): string {
  const trimmed = href.replace(/\/$/, '') || '/';
  if (trimmed === '/' || trimmed === '') return 'root';
  return trimmed.replace(/^\//, '').replace(/\//g, '_');
}

/**
 * Chaves concedidas apenas pela checklist por contrato (aba «Contratos»), não pela matriz «Acesso».
 * Permanecem em `PERMISSION_MODULES` para sincronização/orfãos; a matriz «Acesso» as ignora na UI.
 */
export const PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX: readonly string[] = [
  pathToModuleKey('/ponto/orcamento'),
  pathToModuleKey('/ponto/contratos/relatorios'),
  /** Legado: acesso migrado para Controle «Gerenciar página de aprovadores». */
  pathToModuleKey('/ponto/fluig/aprovadores'),
];

/**
 * Módulos com acesso liberado para todos os usuários autenticados.
 * Permanecem em `PERMISSION_MODULES` para orfãos no banco; ocultos na matriz «Acesso».
 */
export const PERMISSION_MODULE_KEYS_OPEN_ACCESS: readonly string[] = [
  pathToModuleKey('/ponto/drive'),
  pathToModuleKey('/ponto/kanban'),
  pathToModuleKey('/ponto/flow'),
  pathToModuleKey('/ponto/central-de-ajuda'),
];

/**
 * Lista alinhada aos submenus do Sidebar (cada linha = um módulo).
 * Ordem: categorias como no menu lateral.
 */
export const PERMISSION_MODULES: readonly PermissionModuleDef[] = [
  // Principal
  // key estável (legado `ponto_dashboard`) — href atualizado sem invalidar permissões no banco
  { key: pathToModuleKey('/ponto/dashboard'), name: 'Painel do Sistema', href: '/ponto/painel-do-sistema', category: 'Principal' },
  { key: pathToModuleKey('/ponto/financeiro/gestao-solicitacoes'), name: 'Fluig - Processos', href: '/ponto/financeiro/gestao-solicitacoes', category: 'Principal' },
  { key: pathToModuleKey('/ponto/fluig/aprovacoes-workflow'), name: 'Fluig - Aprovações', href: '/ponto/fluig/aprovacoes-workflow', category: 'Principal' },
  { key: pathToModuleKey('/ponto/solicitacoes-dp'), name: 'Solicitações Internas', href: '/ponto/solicitacoes-dp', category: 'Principal' },
  { key: pathToModuleKey('/ponto/reserva-veiculos'), name: 'Frota', href: '/ponto/reserva-veiculos', category: 'Principal' },
  { key: pathToModuleKey('/ponto/solicitar-combustivel'), name: 'Abastecimento', href: '/ponto/solicitar-combustivel', category: 'Principal' },
  { key: pathToModuleKey('/ponto/meus-chamados'), name: 'Meus Chamados', href: '/ponto/meus-chamados', category: 'Principal' },
  { key: pathToModuleKey('/ponto/entrega-logistica'), name: 'Entrega da Logística', href: '/ponto/entrega-logistica', category: 'Principal' },
  /** Acesso livre — oculto na matriz «Acesso» (ver PERMISSION_MODULE_KEYS_OPEN_ACCESS). */
  { key: pathToModuleKey('/ponto/central-de-ajuda'), name: 'Central de Ajuda', href: '/ponto/central-de-ajuda', category: 'Principal' },
  /** Acesso livre — oculto na matriz «Acesso» (ver PERMISSION_MODULE_KEYS_OPEN_ACCESS). */
  { key: pathToModuleKey('/ponto/flow'), name: 'Flow', href: '/ponto/flow', category: 'Principal' },
  /** Acesso livre — oculto na matriz «Acesso» (ver PERMISSION_MODULE_KEYS_OPEN_ACCESS). */
  { key: pathToModuleKey('/ponto/drive'), name: 'Meu Drive', href: '/ponto/drive', category: 'Principal' },
  /** Acesso livre — oculto na matriz «Acesso» (ver PERMISSION_MODULE_KEYS_OPEN_ACCESS). */
  { key: pathToModuleKey('/ponto/kanban'), name: 'Tasks', href: '/ponto/kanban', category: 'Principal' },
  // Departamento Pessoal
  { key: pathToModuleKey('/ponto/funcionarios'), name: 'Funcionários', href: '/ponto/funcionarios', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/folha-pagamento'), name: 'Folha de Pagamento', href: '/ponto/folha-pagamento', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/atestados'), name: 'Ausências', href: '/ponto/atestados', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-atestados'), name: 'Gerenciar Ausências', href: '/ponto/gerenciar-atestados', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/solicitacoes'), name: 'Alterações de Ponto', href: '/ponto/solicitacoes', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-solicitacoes'), name: 'Gerenciar Alterações de Ponto', href: '/ponto/gerenciar-solicitacoes', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-solicitacoes-dp'), name: 'Gerenciar Solicitações', href: '/ponto/gerenciar-solicitacoes-dp', category: 'Departamento Pessoal' },
  {
    key: pathToModuleKey('/ponto/conversas-whatsapp'),
    name: 'Central de Atendimentos',
    href: '/ponto/conversas-whatsapp',
    category: 'Departamento Pessoal',
  },
  // ADM/TST
  {
    key: pathToModuleKey('/ponto/gerenciar-solicitacoes-adm-tst'),
    name: 'Gerenciar Solicitações',
    href: '/ponto/gerenciar-solicitacoes-adm-tst',
    category: 'ADM/TST',
  },
  { key: pathToModuleKey('/ponto/ferias'), name: 'Férias', href: '/ponto/ferias', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-ferias'), name: 'Gerenciar Férias', href: '/ponto/gerenciar-ferias', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-feriados'), name: 'Gerenciar Feriados', href: '/ponto/gerenciar-feriados', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/banco-horas'), name: 'Banco de Horas', href: '/ponto/banco-horas', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/relatorios/alocacao'), name: 'Alocação', href: '/relatorios/alocacao', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/aniversariantes'), name: 'Aniversariantes', href: '/ponto/aniversariantes', category: 'Departamento Pessoal' },
  {
    key: pathToModuleKey('/ponto/seguranca-do-trabalho'),
    name: 'Segurança do Trabalho',
    href: '/ponto/seguranca-do-trabalho',
    category: 'Departamento Pessoal',
  },
  // Financeiro
  { key: pathToModuleKey('/ponto/financeiro/controle-financeiro'), name: 'Controle Financeiro', href: '/ponto/financeiro/controle-financeiro', category: 'Financeiro' },
  { key: pathToModuleKey('/ponto/financeiro/receitas'), name: 'Receitas', href: '/ponto/financeiro/receitas', category: 'Financeiro' },
  { key: pathToModuleKey('/ponto/financeiro/analise-extrato'), name: 'Balanço Financeiro', href: '/ponto/financeiro/analise-extrato', category: 'Métricas' },
  { key: pathToModuleKey('/ponto/financeiro/controle-nfs'), name: "Controle de NF's", href: '/ponto/financeiro/controle-nfs', category: 'Métricas' },
  { key: pathToModuleKey('/ponto/financeiro/nfs-recebidas'), name: 'Entrada Fiscal', href: '/ponto/financeiro/nfs-recebidas', category: 'Métricas' },
  { key: pathToModuleKey('/ponto/financeiro'), name: 'Pagamento da Folha', href: '/ponto/financeiro', category: 'Financeiro' },
  // Engenharia
  { key: pathToModuleKey('/ponto/orcamento'), name: 'Orçamento', href: '/ponto/orcamento', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/contratos'), name: 'Contratos', href: '/ponto/contratos', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/contratos/relatorios'), name: 'Relatórios Fotográficos', href: '/ponto/contratos/relatorios', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/contratos/controle-geral'), name: 'Controle Geral de Contratos', href: '/ponto/contratos/controle-geral', category: 'Métricas' },
  { key: pathToModuleKey('/ponto/contratos/socios'), name: 'Contratos Sócios', href: '/ponto/contratos/socios', category: 'Métricas' },
  { key: pathToModuleKey('/ponto/contratos/gastos-operacionais'), name: 'Gastos Operacionais', href: '/ponto/contratos/gastos-operacionais', category: 'Métricas' },
  { key: pathToModuleKey('/ponto/andamento-da-os'), name: 'Ordem de Serviço', href: '/ponto/andamento-da-os', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/sistema-gestao-os'), name: 'Central de Chamados', href: '/ponto/sistema-gestao-os', category: 'Engenharia' },
  {
    key: pathToModuleKey('/ponto/sistema-gestao-os/planos'),
    name: 'Planos de Manutenção',
    href: '/ponto/sistema-gestao-os/planos',
    category: 'Engenharia',
  },
  {
    key: pathToModuleKey('/ponto/sistema-gestao-os/relatorios'),
    name: 'Relatórios de Chamados',
    href: '/ponto/sistema-gestao-os/relatorios',
    category: 'Engenharia',
  },
  // Contratos e Licitações
  {
    key: pathToModuleKey('/ponto/espelho-nf'),
    name: 'Espelho da Nota Fiscal',
    href: '/ponto/espelho-nf',
    category: 'Contratos e Licitações',
  },
  { key: pathToModuleKey('/ponto/licitacoes'), name: 'Licitações', href: '/ponto/licitacoes', category: 'Contratos e Licitações' },
  {
    key: pathToModuleKey('/ponto/licitacoes-pncp'),
    name: 'Licitações PNCP',
    href: '/ponto/licitacoes-pncp',
    category: 'Contratos e Licitações',
  },
  {
    key: pathToModuleKey('/ponto/responsaveis-tecnicos'),
    name: 'Responsáveis Técnicos',
    href: '/ponto/responsaveis-tecnicos',
    category: 'Contratos e Licitações',
  },
  {
    key: pathToModuleKey('/ponto/controle-anuidade'),
    name: 'Controle de Anuidade',
    href: '/ponto/controle-anuidade',
    category: 'Contratos e Licitações',
  },
  {
    key: pathToModuleKey('/ponto/controle-pagamentos-art'),
    name: "Controle de Pagamentos ART's / Protocolos",
    href: '/ponto/controle-pagamentos-art',
    category: 'Contratos e Licitações',
  },
  {
    key: pathToModuleKey('/ponto/contratos/medicao'),
    name: 'Medições',
    href: '/ponto/contratos/medicao',
    category: 'Contratos e Licitações',
  },
  { key: pathToModuleKey('/ponto/pleitos-gerados'), name: 'Pleitos Gerados', href: '/ponto/pleitos-gerados', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/aprovacao-fds'), name: 'Fichas de Demanda', href: '/ponto/aprovacao-fds', category: 'Engenharia' },
  {
    key: pathToModuleKey('/ponto/recebimento-entregas'),
    name: 'Recebimento de Entregas',
    href: '/ponto/recebimento-entregas',
    category: 'Engenharia',
  },
  {
    key: pathToModuleKey('/ponto/solicitar-materiais'),
    name: 'Solicitação de Materiais',
    href: '/ponto/solicitar-materiais',
    category: 'Engenharia',
  },
  {
    key: pathToModuleKey('/ponto/solicitar-ferramentas'),
    name: 'Solicitação de Ferramentas',
    href: '/ponto/solicitar-ferramentas',
    category: 'Engenharia',
  },
  // Jurídico
  { key: pathToModuleKey('/ponto/juridico'), name: 'Processos Trabalhistas', href: '/ponto/juridico', category: 'Jurídico' },
  // Suprimentos
  { key: pathToModuleKey('/ponto/gerenciar-materiais'), name: 'Requisições de Materiais', href: '/ponto/gerenciar-materiais', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/mapa-cotacao'), name: 'Mapa de Cotação', href: '/ponto/mapa-cotacao', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/ordem-de-compra'), name: 'Ordens de Compra', href: '/ponto/ordem-de-compra', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/controle-entregas'), name: 'Controle de Entregas', href: '/ponto/controle-entregas', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/entregas-logistica'), name: 'Entregas Logística', href: '/ponto/entregas-logistica', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/estoque'), name: 'Estoque', href: '/ponto/estoque', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/furo-estoque'), name: 'Furo de Estoque', href: '/ponto/furo-estoque', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/ajuste-estoque'), name: 'Ajuste de Estoque', href: '/ponto/ajuste-estoque', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/fds-aprovadas'), name: "FD's Aprovadas", href: '/ponto/fds-aprovadas', category: 'Suprimentos' },
  {
    key: pathToModuleKey('/ponto/solicitacoes-combustivel'),
    name: 'Fila de Abastecimento',
    href: '/ponto/solicitacoes-combustivel',
    category: 'Suprimentos',
  },
  {
    key: pathToModuleKey('/ponto/solicitacoes-reserva-veiculos'),
    name: 'Gestão da Frota',
    href: '/ponto/solicitacoes-reserva-veiculos',
    category: 'Suprimentos',
  },
  {
    key: pathToModuleKey('/ponto/solicitacoes-ferramentas'),
    name: 'Pedidos de Ferramentas',
    href: '/ponto/solicitacoes-ferramentas',
    category: 'Suprimentos',
  },
  // Cadastros
  { key: pathToModuleKey('/ponto/centros-custo'), name: 'Centros de Custo', href: '/ponto/centros-custo', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/materiais-construcao'), name: 'Materiais e Serviços', href: '/ponto/materiais-construcao', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/fornecedores'), name: 'Fornecedores', href: '/ponto/fornecedores', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/veiculos'), name: 'Veículos', href: '/ponto/veiculos', category: 'Cadastros' },
  {
    key: pathToModuleKey('/ponto/regioes-postos-combustivel'),
    name: 'Postos de Combustível',
    href: '/ponto/regioes-postos-combustivel',
    category: 'Cadastros',
  },
  { key: pathToModuleKey('/ponto/condicoes-pagamento'), name: 'Condições de Pagamento', href: '/ponto/condicoes-pagamento', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/natureza-orcamentaria'), name: 'Natureza Orçamentária', href: '/ponto/natureza-orcamentaria', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/formularios'), name: 'Formulários', href: '/ponto/formularios', category: 'Cadastros' },
  {
    /** Chave mantida (path antigo) para não invalidar permissões já gravadas no banco. */
    key: pathToModuleKey('/ponto/espelho-nf/prestadores-servico'),
    name: 'Prestadores de Serviço',
    href: '/ponto/prestadores-servico',
    category: 'Cadastros',
  },
  {
    key: pathToModuleKey('/ponto/espelho-nf/tomadores-servico'),
    name: 'Tomadores de Serviço',
    href: '/ponto/tomadores-servico',
    category: 'Cadastros',
  },
  {
    key: pathToModuleKey('/ponto/espelho-nf/contas-bancarias'),
    name: 'Contas Bancárias',
    href: '/ponto/contas-bancarias',
    category: 'Cadastros',
  },
  {
    key: pathToModuleKey('/ponto/espelho-nf/codigos-tributarios'),
    name: 'Códigos Tributários',
    href: '/ponto/codigos-tributarios',
    category: 'Cadastros',
  },
  {
    key: pathToModuleKey('/ponto/sistema-gestao-os/locais'),
    name: 'Locais e Ativos',
    href: '/ponto/sistema-gestao-os/locais',
    category: 'Cadastros',
  },
  {
    key: pathToModuleKey('/ponto/sistema-gestao-os/equipamentos'),
    name: 'Equipamentos',
    href: '/ponto/sistema-gestao-os/equipamentos',
    category: 'Cadastros',
  },
  {
    key: pathToModuleKey('/ponto/sistema-gestao-os/tipos-servico'),
    name: 'Tipos de Serviço',
    href: '/ponto/sistema-gestao-os/tipos-servico',
    category: 'Cadastros',
  },
  // Registros de Ponto
  { key: pathToModuleKey('/ponto'), name: 'Registros de Ponto', href: '/ponto', category: 'Registros de Ponto' },
  /**
   * Legado — permanece no registro para orfãos no banco; oculto na matriz «Acesso».
   * Acesso atual: Controle «Dar permissão na página de aprovadores» ou designação por aprovador.
   */
  {
    key: pathToModuleKey('/ponto/fluig/aprovadores'),
    name: 'Aprovadores',
    href: '/ponto/fluig/aprovadores',
    category: 'Principal',
  },
  /**
   * Controle — permissões administrativas que não correspondem a uma página do menu lateral
   * (chaves estáveis para checagem em `can()` / API).
   */
  {
    key: pathToModuleKey('/ponto/controle/alterar-permissoes'),
    name: 'Alterar permissões de funcionários',
    href: '/ponto/controle/alterar-permissoes',
    category: 'Controle',
    group: 'Geral',
  },
  {
    key: pathToModuleKey('/ponto/controle/criar-tipos-restritos-dp'),
    name: 'Criar solicitações restritas',
    href: '/ponto/controle/criar-tipos-restritos-dp',
    category: 'Controle',
    group: 'Geral',
  },
  {
    key: pathToModuleKey('/ponto/controle/alterar-senha-funcionarios'),
    name: 'Alterar senha de funcionários',
    href: '/ponto/controle/alterar-senha-funcionarios',
    category: 'Controle',
    group: 'Geral',
  },
  {
    key: pathToModuleKey('/ponto/controle/ver-valores-kanban'),
    name: 'Ver valores do Kanban',
    href: '/ponto/controle/ver-valores-kanban',
    category: 'Controle',
    group: 'Geral',
  },
  {
    key: pathToModuleKey('/ponto/controle/gerenciar-aprovadores-fluig'),
    name: 'Dar permissão na página de aprovadores',
    href: '/ponto/controle/gerenciar-aprovadores-fluig',
    category: 'Controle',
    group: 'Geral',
  },
  {
    key: pathToModuleKey('/ponto/controle/aprovar-espelho-nf'),
    name: 'Aprovar Espelho da Nota Fiscal',
    href: '/ponto/controle/aprovar-espelho-nf',
    category: 'Controle',
    group: 'Aprovações',
  },
  {
    key: pathToModuleKey('/ponto/controle/aprovar-combustivel'),
    name: 'Aprovar Abastecimento',
    href: '/ponto/controle/aprovar-combustivel',
    category: 'Controle',
    group: 'Aprovações',
  },
  {
    key: pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais'),
    name: 'Aprovar Requisições de Materiais',
    href: '/ponto/controle/aprovar-requisicoes-materiais',
    category: 'Controle',
    group: 'Aprovações',
  },
  {
    key: pathToModuleKey('/ponto/controle/aprovar-oc-compras'),
    name: 'Aprovar Ordem de Compra - Compras',
    href: '/ponto/controle/aprovar-oc-compras',
    category: 'Controle',
    group: 'Aprovações',
  },
  {
    key: pathToModuleKey('/ponto/controle/aprovar-oc-gestor'),
    name: 'Aprovar Ordem de Compra - Gestor',
    href: '/ponto/controle/aprovar-oc-gestor',
    category: 'Controle',
    group: 'Aprovações',
  },
  {
    key: pathToModuleKey('/ponto/controle/aprovar-oc-diretoria'),
    name: 'Aprovar Ordem de Compra - Diretoria',
    href: '/ponto/controle/aprovar-oc-diretoria',
    category: 'Controle',
    group: 'Aprovações',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-anexar-boleto'),
    name: 'Anexar Boleto',
    href: '/ponto/controle/oc-anexar-boleto',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-pagamento'),
    name: 'Pagamento',
    href: '/ponto/controle/oc-pagamento',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-validar-comprovante'),
    name: 'Validação Comprovante',
    href: '/ponto/controle/oc-validar-comprovante',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-corrigir-comprovante'),
    name: 'Correção Comprovante',
    href: '/ponto/controle/oc-corrigir-comprovante',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-anexar-nf'),
    name: 'Anexar NF / Finalizar',
    href: '/ponto/controle/oc-anexar-nf',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-correcao'),
    name: 'Correção (editar / reenviar)',
    href: '/ponto/controle/oc-correcao',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/oc-devolver-item-rm'),
    name: 'Devolver item da OC à RM',
    href: '/ponto/controle/oc-devolver-item-rm',
    category: 'Controle',
    group: 'Ordem de Compra',
  },
  {
    key: pathToModuleKey('/ponto/controle/gestao-os-analisar'),
    name: 'Analisar / aprovar OS',
    href: '/ponto/controle/gestao-os-analisar',
    category: 'Controle',
    group: 'Gestão de OS',
  },
  {
    key: pathToModuleKey('/ponto/controle/gestao-os-executar'),
    name: 'Executar OS',
    href: '/ponto/controle/gestao-os-executar',
    category: 'Controle',
    group: 'Gestão de OS',
  },
  {
    key: pathToModuleKey('/ponto/controle/gestao-os-encerrar'),
    name: 'Encerrar / avaliar OS',
    href: '/ponto/controle/gestao-os-encerrar',
    category: 'Controle',
    group: 'Gestão de OS',
  },
] as const;

/**
 * Módulos com acesso (VER) concedido por padrão a todo usuário do sistema —
 * existentes (backfill no boot) e novos cadastros.
 */
export const DEFAULT_EMPLOYEE_ACCESS_MODULE_HREFS = [
  '/ponto/solicitacoes-dp',
  '/ponto/reserva-veiculos',
  '/ponto/solicitar-combustivel',
] as const;

export const DEFAULT_EMPLOYEE_ACCESS_MODULE_KEYS = DEFAULT_EMPLOYEE_ACCESS_MODULE_HREFS.map(
  (href) => pathToModuleKey(href)
);

const keySet = new Set(PERMISSION_MODULES.map((m) => m.key));

export function getPermissionModuleKeys(): string[] {
  return PERMISSION_MODULES.map((m) => m.key);
}

export function isValidPermissionModuleKey(module: string): boolean {
  return keySet.has(module);
}

/** Payload da API: ação precisa existir no conjunto permitido. */
export function isValidPermissionAction(action: string): boolean {
  return (PERMISSION_ACTIONS as readonly string[]).includes(action);
}

/** Categoria reservada para o registro acima (aba Controle no editor de permissões). */
export const PERMISSION_CONTROLE_CATEGORY = 'Controle' as const;

/** Ordem dos tópicos na aba Controle. */
export const PERMISSION_CONTROLE_GROUP_ORDER = [
  'Geral',
  'Aprovações',
  'Ordem de Compra',
] as const;
