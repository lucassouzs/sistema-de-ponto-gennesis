/**
 * Palavras-chave do objeto para espelho PNCP (ingestão + filtros).
 * Matching: objeto normalizado (sem acento) precisa conter o termo.
 */
export const PNCP_KEYWORDS_OBJETO_PADRAO = [
  // Reforma / recuperação / adequação predial
  'reforma',
  'recuperacao predial',
  'adequacao predial',
  'reforma predial',
  'reforma e ampliacao',
  'reforma e ampliação',
  'execucao de obras civis',
  'execução de obras civis',
  'obras civis para reforma',
  'manutencao predial',
  'manutenção predial',
  'manutencao predial corretiva',
  'manutenção predial corretiva',
  'manutencao preditiva',
  'manutenção preditiva',
  'manutencoes preventivas',
  'manutenções preventivas',
  'manutencoes corretivas',
  'manutenções corretivas',
  'preventiva e corretiva',
  'preventivas e corretivas',

  // Engenharia / serviços
  'servicos comuns de engenharia',
  'serviços comuns de engenharia',
  'prestacao de servicos comuns de engenharia',
  'prestação de serviços comuns de engenharia',
  'bens imoveis publicos',
  'bens imóveis públicos',
  'adaptacoes',
  'adaptações',
  'adequacoes',
  'adequações',

  // Conservação / limpeza
  'conservacao e limpeza externa',
  'conservação e limpeza externa',
  'limpeza externa',
  'conservacao predial',
  'conservação predial',

  // ARP / manutenção
  'ata de registro de precos para manutencao predial',
  'ata de registro de preços para manutenção predial',
  'registro de precos para manutencao predial',
  'registro de preços para manutenção predial',

  // Projetos / elétricas
  'diagnosticos e projetos de instalacoes eletricas',
  'diagnósticos e projetos de instalações elétricas',
  'projetos de instalacoes eletricas',
  'projetos de instalações elétricas',
  'instalacoes eletricas',
  'instalações elétricas',
  'elaboracao de projetos',
  'elaboração de projetos',

  // Escolas / hospitais
  'unidades escolares',
  'unidades hospitalares',
  'manutencao predial, preventiva e corretiva',
  'manutenção predial, preventiva e corretiva',

  // Calçadas / áreas externas / praças
  'construcao de calcadas',
  'construção de calçadas',
  'plantio de grama',
  'assentamento de meio fio',
  'meio fio',
  'manutencao de pracas',
  'manutenção de praças',
  'quadras poliesportivas',

  // Material / pavimentação
  'material de construcao',
  'material de construção',
  'aquisicao de material de construcao',
  'aquisição de material de construção',
  'aquisicao cbuq',
  'aquisição cbuq',
  'cbuq',
  'pavimentacoes em piso intertravado',
  'pavimentações em piso intertravado',
  'piso intertravado',
  'paralelepipedos',
  'paralelepípedos',
  'pavimentacao',
  'pavimentação',

  // Jardinagem / áreas verdes
  'servicos continuados de jardinagem',
  'serviços continuados de jardinagem',
  'jardinagem',
  'manutencao de areas verdes',
  'manutenção de áreas verdes',
  'areas verdes',
  'áreas verdes',
  'manutencao de plantas',
  'manutenção de plantas',

  // Facilities
  'facilities',
  'facility',
  'gestao de facilities',
  'gestão de facilities',
  'servicos de facilities',
  'serviços de facilities',

  // Sob demanda / execução
  'especializadas para execucao, sob demanda',
  'especializadas para execução, sob demanda',
] as const;
