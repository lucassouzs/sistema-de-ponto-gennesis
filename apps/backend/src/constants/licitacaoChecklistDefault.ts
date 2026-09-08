export type LicitacaoChecklistSection = {
  id: string;
  title: string;
  items: Array<{ id: string; label: string }>;
};

/** Bump ao alterar o template padrão (força atualização no banco). */
export const LICITACAO_CHECKLIST_TEMPLATE_VERSION = 2;

export const DEFAULT_LICITACAO_CHECKLIST: LicitacaoChecklistSection[] = [
  {
    id: 'viabilidade-financeira',
    title: '1. Viabilidade Financeira',
    items: [
      { id: 'valor-estimado', label: 'Valor estimado da contratação:' },
      { id: 'prazo-contratual', label: 'Prazo contratual:' },
      {
        id: 'possibilidade-prorrogacao',
        label: 'Há possibilidade de prorrogação? De quanto?',
      },
      { id: 'ticket-medio-mensal', label: 'Ticket médio mensal do contrato:' },
      {
        id: 'periodo-vigencia',
        label: 'Qual o período de vigência do contrato / serviço?',
      },
      {
        id: 'investimento-inicial',
        label: 'O contrato exige investimento inicial relevante? Quanto?',
      },
      {
        id: 'aquisicao-equipamentos-materiais',
        label:
          'Há necessidade de aquisição de equipamentos, veículos ou materiais? Descrever.',
      },
      { id: 'margem-liquida', label: 'Margem líquida estimada:' },
    ],
  },
  {
    id: 'criterio-julgamento',
    title: '2. Critério de Julgamento',
    items: [
      { id: 'modo-disputa', label: 'Modo de disputa:' },
      { id: 'criterio-julgamento', label: 'Critério de julgamento:' },
      { id: 'julgamento-item-grupo-lote', label: 'Julgamento por item, grupo ou lote:' },
      { id: 'desconto-maximo-permitido', label: 'Desconto máximo permitido:' },
      {
        id: 'proposta-tecnica-nota-minima',
        label: 'Existe proposta técnica? Qual a nota mínima exigida?',
      },
      {
        id: 'disputa-compativel-estrategia',
        label: 'A disputa é compatível com a estratégia da empresa?',
      },
    ],
  },
  {
    id: 'objeto-licitacao',
    title: '3. Objeto da Licitação',
    items: [
      { id: 'objeto-resumido', label: 'Objeto resumido:' },
      { id: 'area-atuacao', label: 'Qual a área de atuação da licitação?' },
      {
        id: 'objeto-compativel-experiencia',
        label: 'O objeto é compatível com a atuação/experiência da empresa?',
      },
      {
        id: 'escopo-fornecimento-materiais',
        label: 'O escopo exige fornecimento relevante de materiais?',
      },
      {
        id: 'complexidade-operacional',
        label: 'A complexidade operacional é aceitável?',
      },
    ],
  },
  {
    id: 'habilitacao-tecnica',
    title: '4. Habilitação Técnica',
    items: [
      {
        id: 'atestados-cat-empresa',
        label: 'Quais os atestados/CAT exigidos da EMPRESA? Descrever.',
      },
      {
        id: 'empresa-habilita-documentacao',
        label: 'A empresa se habilita / possui documentação técnica compatível?',
      },
      {
        id: 'exige-atestado-cat-profissionais',
        label: 'Exige atestado/CAT dos profissionais?',
      },
      {
        id: 'profissionais-exigidos-detalhes',
        label:
          'Quais os profissionais exigidos, respectivas profissões, quantidades e atestações/CAT obrigatórias?',
      },
      {
        id: 'profissionais-quadro-tecnico',
        label:
          'Citar os profissionais que a empresa possui em seu quadro técnico com as respectivas atestações (Nome + Função):',
      },
      {
        id: 'profissionais-nao-possui',
        label: 'Citar os profissionais que a empresa NÃO possui em seu quadro técnico:',
      },
      {
        id: 'necessidade-contratar-profissional',
        label: 'Há necessidade de contratar profissional com habilitação técnica compatível?',
      },
    ],
  },
  {
    id: 'habilitacao-economico-financeira',
    title: '5. Habilitação Econômico-Financeira',
    items: [
      { id: 'patrimonio-liquido-minimo', label: 'Exige patrimônio líquido mínimo:' },
      { id: 'capital-social-minimo', label: 'Exige capital social mínimo:' },
      { id: 'indices-contabeis-minimos', label: 'Exige índices contábeis mínimos:' },
      { id: 'garantia-proposta', label: 'Exige garantia de proposta:' },
      { id: 'garantia-contratual', label: 'Exige garantia contratual:' },
      {
        id: 'atende-exigencias-economico-financeiras',
        label: 'A empresa atende às exigências econômico-financeiras?',
      },
    ],
  },
  {
    id: 'habilitacao-fiscal-trabalhista',
    title: '6. Habilitação Fiscal e Trabalhista',
    items: [
      {
        id: 'documentacao-vencida-pendente',
        label: 'Há alguma documentação vencida ou pendente?',
      },
    ],
  },
  {
    id: 'capacidade-operacional',
    title: '7. Capacidade Operacional',
    items: [
      { id: 'quantidade-postos', label: 'Quantidade de postos previstos:' },
      { id: 'necessidade-equipe-fixa', label: 'Necessidade de equipe fixa?' },
      {
        id: 'servicos-equipe-sob-demanda',
        label: 'Pode haver necessidade de serviços/equipe sob demanda? Se sim, quais?',
      },
      {
        id: 'quantidade-equipes-simultaneas',
        label: 'Quantidade de equipes simultâneas necessárias:',
      },
      {
        id: 'quantidade-supervisores-engenheiros',
        label: 'Quantidade de supervisores e engenheiros exigidos:',
      },
      {
        id: 'quantidade-modalidades-profissionais',
        label: 'Quantidade e modalidades dos profissionais técnicos exigidos:',
      },
      {
        id: 'atendimento-24h-plantao',
        label: 'Há exigência de atendimento 24h, plantão ou sobreaviso?',
      },
      {
        id: 'equipamentos-ferramentas-veiculos',
        label: 'Há exigência de equipamentos, ferramentas ou veículos específicos?',
      },
    ],
  },
  {
    id: 'analise-edital',
    title: '8. Análise do Edital',
    items: [
      {
        id: 'aceita-consorcio',
        label: 'Aceita consórcio? Quais as observações/especificações informadas?',
      },
      { id: 'permite-adesao', label: 'Permite adesão:' },
      { id: 'grupos', label: 'Grupos:' },
      { id: 'local-execucao', label: 'Local de execução:' },
      { id: 'tabela-referencia', label: 'Tabela de referência utilizada:' },
      { id: 'penalidades-relevantes', label: 'Penalidades relevantes:' },
      { id: 'possibilidade-glosas', label: 'Possibilidade de glosas:' },
      {
        id: 'esclarecimento-impugnacao',
        label:
          'É necessário pedir esclarecimento ou impugnar algum ponto? Se sim, descrever.',
      },
    ],
  },
  {
    id: 'estrategia',
    title: '9. Estratégia',
    items: [
      { id: 'desconto-maximo-sustentavel', label: 'Desconto máximo sustentável:' },
      {
        id: 'preco-margem-minima-alvo',
        label: 'Preço/margem mínima aceitável e preço alvo:',
      },
    ],
  },
  {
    id: 'decisao-final',
    title: '10. Decisão Final',
    items: [
      {
        id: 'habilitacao-atendida',
        label: 'Habilitação atendida (Empresa e Profissionais):',
      },
      { id: 'risco-aceitavel', label: 'Risco aceitável:' },
      { id: 'participar', label: 'Participar:' },
      { id: 'nao-participar', label: 'Não participar:' },
      { id: 'justificativa-decisao', label: 'Justificativa da decisão?' },
    ],
  },
];
