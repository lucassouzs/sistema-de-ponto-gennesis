import { normalizeNaturezaLabel } from '@/lib/contractPaidNaturezaExclusions';

/** Normaliza variações comuns do RM (espaços, "/", parênteses, sufixo - SV). */
export function normalizeGastosOperacionaisNaturezaKey(natureza: string): string {
  return normalizeNaturezaLabel(natureza)
    .replace(/(\S)\s*-\s+/g, '$1 - ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*\/\s*/g, '/')
    .replace(/ - SV$/i, '')
    .trim();
}

export type GastosOperacionaisDfcNaturezaEntry = {
  label: string;
  aliases?: readonly string[];
  /** Crédito: única natureza que entra somando (positivo) nos totais. */
  sumAsPositiveCredit?: boolean;
};

export type GastosOperacionaisDfcLeafBlock = {
  id: string;
  code: string;
  label: string;
  parentLabels: readonly string[];
  naturezas: readonly GastosOperacionaisDfcNaturezaEntry[];
};

/** 1. Atividades Operacionais → 1.2 Deduções da Receita Operacional → 1.2.1 Tributo Retido */
export const GASTOS_OPERACIONAIS_DFC_TRIBUTO_RETIDO_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'tributo-retido',
  code: '1.2.1',
  label: 'Tributo Retido',
  parentLabels: ['1. Atividades Operacionais', '1.2 Deduções da Receita Operacional'],
  naturezas: [{ label: 'ISS - RETIDO' }]
};

/** 1. Atividades Operacionais → 1.2 Deduções da Receita Operacional → 1.2.4 Tributo Pago */
export const GASTOS_OPERACIONAIS_DFC_TRIBUTO_PAGO_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'tributo-pago',
  code: '1.2.4',
  label: 'Tributo Pago',
  parentLabels: ['1. Atividades Operacionais', '1.2 Deduções da Receita Operacional'],
  naturezas: [
    { label: 'ISS' },
    { label: 'COFINS' },
    { label: 'SIMPLES NACIONAL' },
    { label: 'CSLL' },
    { label: 'IMPOSTO DE RENDA - IRPJ' },
    { label: 'PIS' }
  ]
};

/** 1. Atividades Operacionais → 1.2 Deduções da Receita Operacional → 1.2.3 Repasses a terceiros */
export const GASTOS_OPERACIONAIS_DFC_REPASSES_TERCEIROS_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'repasses-terceiros',
  code: '1.2.3',
  label: 'Repasses a terceiros',
  parentLabels: ['1. Atividades Operacionais', '1.2 Deduções da Receita Operacional'],
  naturezas: [
    {
      label: 'REPASSE A PARCEIROS E CONSORCIADOS',
      aliases: [
        'REPASSE A PARCEIROS E CONSORCIADOS - SV',
        'REPASSE A PARCEIROS E CONSORCIADOS (TERCEIROS)',
        'REPASSE A PARCEIROS E CONSORCIADOS (TERCEIROS) - SV'
      ]
    }
  ]
};

/** 1. Atividades Operacionais → 1.3 Custos Operacionais → 1.3.1 Pessoal */
export const GASTOS_OPERACIONAIS_DFC_PESSOAL_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'pessoal',
  code: '1.3.1',
  label: 'Pessoal',
  parentLabels: ['1. Atividades Operacionais', '1.3 Custos Operacionais'],
  naturezas: [
    {
      label: 'PRESTADORES DE SERVICO ENGENHARIA (PF / PJ)',
      aliases: [
        'SERVICOS ESPECIALIZADOS DE ENGENHARIA (PF/PJ)',
        'PRESTADORES DE SERVICO ENGENHARIA (PF/PJ)'
      ]
    },
    { label: 'SALARIO' },
    { label: 'SALARIOS E ENCARGOS - COLIGADA' },
    { label: 'VALE REFEIÇÃO', aliases: ['VALE ALIMENTACAO', 'VALE REFEICAO'] },
    { label: 'FGTS' },
    {
      label: 'INSS',
      aliases: ['INSS - RETIDO', 'RETENCAO DE INSS - SV']
    },
    {
      label: 'ADIANTAMENTO SALARIAL',
      aliases: ['ADIANTAMENTO SALARIAL - SV']
    },
    {
      label: 'TERCEIRIZADOS PF',
      aliases: [
        'PRESTACAO DE SERVICOS TERCEIRIZADOS',
        'PRESTACAO DE SERVICOS TERCEIRIZADOS - SV',
        'TERCEIRIZADOS PF - SV'
      ]
    },
    { label: '13º SALARIO', aliases: ['13 SALARIO'] },
    { label: 'FERIAS' },
    { label: 'RESCISAO PESSOAL' },
    {
      label: 'ACOES TRABALHISTAS/ INDENIZACOES/CUSTAS',
      aliases: ['ACOES TRABALHISTAS/INDENIZACOES/CUSTAS']
    },
    { label: 'AUXILIO ALIMENTACAO', aliases: ['AUXILIO ALIMENTACAO - SV'] },
    { label: 'ACRESCIMOS (PESSOAL)' },
    { label: 'IMPOSTO DE RENDA S/ FOLHA', aliases: ['IMPOSTO DE RENDE S/ FOLHA'] },
    { label: 'AUXILIO TRANSPORTE' },
    { label: 'ASO E EXAMES MEDICOS' },
    { label: 'BOLSAS E OUTROS GASTOS COM ESTAGIARIOS' },
    { label: 'VIAGENS DE COLABORADORES - ALIMENTACAO' },
    { label: 'VIAGENS DE COLABORADORES - TRANSPORTE' },
    { label: 'PENSAO ALIMENTICIA' },
    { label: 'CURSOS E TREINAMENTOS' },
    { label: 'VALE TRANSPORTE' },
    {
      label: 'VALE COMBUSTIVEL',
      aliases: ['VALE COMBUSTÍVEL', 'AUXILIO COMBUSTIVEL']
    },
    { label: 'FARDAMENTOS' },
    { label: 'VIAGENS DE COLABORADORES - HOSPEDAGEM E DIARIAS' },
    { label: 'DIARIAS', aliases: ['DIARIAS SALARIAIS', 'DIARIAS - SV'] },
    { label: 'CAIXA - FUNDO FIXO ADM DP' },
    { label: 'SEGURO FUNCIONARIOS', aliases: ['SEGURO FUNCIONARIOS - SV'] },
    { label: 'PLANO DE SAUDE' },
    {
      label: 'RECRUTAMENTO E SELEÇÃO DE COLABORADORES',
      aliases: ['RECRUTAMENTO E SELECAO DE COLABORADORES']
    },
    { label: 'COMPRA DE MEDICAMENTOS', aliases: ['COMPRA DE MEDICAMENTOS - SV'] },
    {
      label: 'DESBLOQUEIO E ESTORNOS JUDICIAIS',
      sumAsPositiveCredit: true
    },
    { label: 'DISTRATO DE CONTRATO PRESTADOR', aliases: ['DISTRATO DE CONTRATO PRESTADOR - SV'] },
    { label: 'GRATIFICACOES/COMISSOES' },
    { label: 'FESTA E EVENTOS' },
    { label: 'BONIFICACAO META', aliases: ['BONIFICACAO META (PREMIACAO) - SV'] }
  ]
};

/** 1. Atividades Operacionais → 1.3 Custos Operacionais → 1.3.2 Material Aplicado */
export const GASTOS_OPERACIONAIS_DFC_MATERIAL_APLICADO_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'material-aplicado',
  code: '1.3.2',
  label: 'Material Aplicado',
  parentLabels: ['1. Atividades Operacionais', '1.3 Custos Operacionais'],
  naturezas: [
    { label: 'INSUMOS - ELETRICA' },
    { label: 'INSUMOS - REVESTIMENTOS' },
    { label: 'INSUMOS - FORRO' },
    { label: 'INSUMOS - ALVENARIA' },
    { label: 'INSUMOS - PINTURA' },
    { label: 'INSUMOS - MARCENARIA' },
    { label: 'INSUMOS - SERRALHERIA E FERRAGENS' },
    { label: 'MATERIAL INSTALACAO DE GAS' },
    { label: 'CAIXA - FUNDO FIXO OBRA' },
    { label: 'INSUMOS - HIDRAULICA' },
    { label: 'COBERTURA/CALHA' },
    { label: 'INSUMOS - TELECOMUNICACOES' },
    {
      label: 'MATERIAL BRUTO DE CONSTRUCAO (CIMENTO, AREIA, BRITA E TIJOLO)'
    },
    { label: 'INSUMOS - CONCRETO' },
    {
      label: 'REEMBOLSO TRANSFERENCIA DE MATERIAL',
      aliases: ['REEMBOLSO TRANSFERÊNCIA DE MATERIAL']
    },
    { label: 'INSUMOS - FERRAMENTAS EQUIP E MAQ' },
    { label: 'INSUMOS - VIDRACARIA' },
    { label: 'ESQUADRIAS (EXCETO FERRO)' },
    { label: 'FRETES E CARREGOS' },
    { label: 'FRETE SOBRE COMPRAS' },
    { label: 'INSUMOS - IMPERMEABILIZACAO' },
    { label: 'INSUMOS - MATERIAL DE LIMPEZA DE OBRA' },
    { label: 'INSUMOS - MADEIRAMENTO' },
    { label: 'INSUMOS - EPI / EPC' },
    { label: 'MARMORE/GRANITO' },
    { label: 'INSUMOS - PAISAGISMO' },
    { label: 'LOUCAS E METAIS' },
    { label: 'SINALIZACAO' },
    { label: 'MATERIAL DE CLIMATIZACAO' },
    {
      label: 'DEVOLUCOES E ESTORNOS DE FORNECEDORES',
      sumAsPositiveCredit: true,
      aliases: [
        'DEVOLUCOES E ESTORNO DE FORNECEDORES',
        'DEVOLUÇÕES E ESTORNOS DE FORNECEDORES'
      ]
    },
    { label: 'PAVIMENTACAO' },
    { label: 'ICMS - DIFAL' },
    { label: 'RECARGA DE EXTINTORES' },
    { label: 'CONFECCAO DE PERSIANAS' },
    {
      label: 'COMBUSTIVEL PARA EQUIPAMENTOS',
      aliases: ['COMBUSTIVEL OPERAÇÃO', 'COMBUSTIVEL OPERACAO']
    }
  ]
};

/** 1. Atividades Operacionais → 1.3 Custos Operacionais → 1.3.3 Serviços Terceirizados */
export const GASTOS_OPERACIONAIS_DFC_SERVICOS_TERCEIRIZADOS_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'servicos-terceirizados',
  code: '1.3.3',
  label: 'Serviços Terceirizados',
  parentLabels: ['1. Atividades Operacionais', '1.3 Custos Operacionais'],
  naturezas: [
    {
      label: 'SERVICOS TOMADOS',
      aliases: ['OUTROS SERVICOS TOMADOS', 'SERVICOS TOMADOS - SV']
    },
    { label: 'PROJETOS DE ARQUITETURA / ENGENHARIA' },
    { label: 'SERVICO INSTALACAO DE GAS' },
    { label: 'REMOCAO DE ENTULHO' },
    { label: 'MANUTENCAO DE MAQUINAS E EQUIPAMENTOS' },
    {
      label: 'LOCACAO DE MAQUINAS E EQUPAMENTOS - MANUTENCAO',
      aliases: ['LOCACAO DE MAQUINAS E EQUIPAMENTOS - MANUTENCAO']
    },
    { label: 'SEGURANCA DO TRABALHO' },
    { label: 'ESGOTAMENTO SANITARIO' },
    { label: 'INSUMOS - CONTROLE DE PRAGAS' }
  ]
};

/** 1. Atividades Operacionais → 1.3 Custos Operacionais → 1.3.4 Canteiro de obra */
export const GASTOS_OPERACIONAIS_DFC_CANTEIRO_OBRA_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'canteiro-obra',
  code: '1.3.4',
  label: 'Canteiro de obra',
  parentLabels: ['1. Atividades Operacionais', '1.3 Custos Operacionais'],
  naturezas: [
    { label: 'ALUGUEL DE MAQUINAS E EQUIPAMENTOS - OBRA' },
    { label: 'ENERGIA ELETRICA' },
    { label: 'AGUA E ESGOTO' },
    { label: 'MATERIAL CONSUMO' },
    { label: 'ALUGUEL E CONDOMINIO CASA OU CONTEINER CANTEIRO' },
    { label: 'MATERIAL EXPEDIENTE' },
    { label: 'MOVEIS E UTENSILIOS', aliases: ['MÓVEIS E UTENSILIOS'] },
    { label: 'INTERNET' },
    { label: 'MANUTENCAO PREDIAL' },
    { label: 'SEGURANCA/VIGILANCIA', aliases: ['SEGURANCA / VIGILANCIA'] },
    { label: 'SEGURO IMOVEL' },
    { label: 'IPTU' },
    { label: 'TELEFONE' },
    { label: 'IMPRESSAO E PLOTAGEM' }
  ]
};

/** 1. Atividades Operacionais → 1.3 Custos Operacionais → 1.3.5 Veículos e Logística */
export const GASTOS_OPERACIONAIS_DFC_VEICULOS_LOGISTICA_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'veiculos-logistica',
  code: '1.3.5',
  label: 'Veículos e Logística',
  parentLabels: ['1. Atividades Operacionais', '1.3 Custos Operacionais'],
  naturezas: [
    {
      label: 'COMBUSTIVEL DE VEICULOS',
      aliases: ['COMBUSTIVEL DE VEICULO', 'COMBUSTIVEL DE VEICULOS - SV']
    },
    { label: 'MANUTENCAO DE VEICULOS' },
    { label: 'ALUGUEL DE CARRO' },
    { label: 'IPVA E TAXAS DE LECENCIAMENTOS DE VEICULOS' },
    { label: 'MULTAS DE TRANSITO VEICULOS' },
    { label: 'RASTREADOR DE VEICULOS' },
    { label: 'SEGUROS VEICULOS' },
    { label: 'CAIXA - FUNDO FIXO - LOGISTICA' }
  ]
};

/** 1. Atividades Operacionais → 1.3 Custos Operacionais → 1.3.6 Taxas e tarifas */
export const GASTOS_OPERACIONAIS_DFC_TAXAS_TARIFAS_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'taxas-tarifas',
  code: '1.3.6',
  label: 'Taxas e tarifas',
  parentLabels: ['1. Atividades Operacionais', '1.3 Custos Operacionais'],
  naturezas: [
    { label: 'DESPESAS E TARIFAS BANCARIAS' },
    { label: 'SEGURO DE OBRA' },
    { label: 'ART' },
    { label: 'ATESTADO DE CAPACIDADE TECNICA / CAT' },
    { label: 'TAXAS E EMOLUMENTOS' },
    { label: 'ANUIDADE CREA' },
    { label: 'ANUIDADE CAU' },
    { label: 'ANUIDADE CRA' },
    { label: 'RRT CAU' },
    { label: 'SEGURO EM PROPOSTAS LICITATORIAS' },
    { label: 'TAXA DE LOCALIZACAO E FUNCIONAMENTO - ALVARA' },
    { label: 'CORREIOS' }
  ]
};

/** 1. Atividades Operacionais → 1.4 Despesas Operacionais → 1.4.2 Serviços terceirizados */
export const GASTOS_OPERACIONAIS_DFC_DESPESAS_SERVICOS_TERCEIRIZADOS_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'despesas-servicos-terceirizados',
  code: '1.4.2',
  label: 'Serviços terceirizados',
  parentLabels: ['1. Atividades Operacionais', '1.4 Despesas Operacionais'],
  naturezas: [
    { label: 'CONTABILIDADE' },
    { label: 'ASSESSORIA GERENCIAL' },
    { label: 'ASSESSORIA JURIDICA TRABALHISTA' },
    { label: 'ASSESSORIA JURIDICA NAO TRABALHISTA' }
  ]
};

/** 1. Atividades Operacionais → 1.4 Despesas Operacionais → 1.4.3 Tecnologia */
export const GASTOS_OPERACIONAIS_DFC_INFORMATICA_SOFTWARE_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'tecnologia',
  code: '1.4.3',
  label: 'Tecnologia',
  parentLabels: ['1. Atividades Operacionais', '1.4 Despesas Operacionais'],
  naturezas: [
    { label: 'LICENÇA E MENSALIDADE DE SOFTWARE' },
    { label: 'MANUTENCAO DE HARDWARE / SOFTWARE' }
  ]
};

/** 1. Atividades Operacionais → 1.4 Despesas Operacionais → 1.4.4 Comercial e Marketing */
export const GASTOS_OPERACIONAIS_DFC_COMERCIAL_MARKETING_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'comercial-marketing',
  code: '1.4.4',
  label: 'Comercial e Marketing',
  parentLabels: ['1. Atividades Operacionais', '1.4 Despesas Operacionais'],
  naturezas: [
    { label: 'MARKETING E PUBLICIDADE' },
    { label: 'DESPESA COM LICITACAO' },
    { label: 'PATROCINIO' }
  ]
};

/** 1. Atividades Operacionais → 1.4 Despesas Operacionais → 1.4.5 Escritorios do administrativo */
export const GASTOS_OPERACIONAIS_DFC_ESCRITORIOS_ADMINISTRATIVO_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'escritorios-administrativo',
  code: '1.4.5',
  label: 'Escritorios do administrativo',
  parentLabels: ['1. Atividades Operacionais', '1.4 Despesas Operacionais'],
  naturezas: [{ label: 'ALUGUEL DE MAQUINAS E EQUIPAMENTOS ADMINISTRATIVOS' }]
};

/** 1. Atividades Operacionais → 1.4 Despesas Operacionais → 1.4.8 Diretoria */
export const GASTOS_OPERACIONAIS_DFC_DIRETORIA_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'diretoria',
  code: '1.4.8',
  label: 'Diretoria',
  parentLabels: ['1. Atividades Operacionais', '1.4 Despesas Operacionais'],
  naturezas: [
    { label: 'PRO-LABORE' },
    { label: 'OUTROS BENEFICIOS DA DIRETORIA' },
    { label: 'PLANO DE SAUDE DIRETORIA' }
  ]
};

/** 1. Atividades Operacionais → 1.4 Despesas Operacionais → 1.4.9 Rateio ADM */
export const GASTOS_OPERACIONAIS_DFC_REPASSE_ADM_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'repasse-adm',
  code: '1.4.9',
  label: 'Rateio ADM',
  parentLabels: ['1. Atividades Operacionais', '1.4 Despesas Operacionais'],
  naturezas: [
    {
      label: 'REPASSE AO ADM - SAIDA',
      aliases: [
        'RATEIO DO ADM - SAIDA',
        'RATEIO AO ADM - SAIDA',
        'REPASSE AO ADM - SAIDA - SV'
      ]
    },
    {
      label: 'REPASSE AO ADM - ENTRADA',
      sumAsPositiveCredit: true,
      aliases: [
        'RATEIO DO ADM - ENTRADA',
        'RATEIO AO ADM - ENTRADA',
        'REPASSE AO ADM - ENTRADA - SV'
      ]
    }
  ]
};

/** 2. Atividades de Investimento → 2.1 Investimentos → 2.1.1 Imoveis e instalacoes */
export const GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_IMOVEIS_INSTALACOES_BLOCK: GastosOperacionaisDfcLeafBlock =
  {
    id: 'investimentos-imoveis-instalacoes',
    code: '2.1.1',
    label: 'Imoveis e instalacoes',
    parentLabels: ['2. Atividades de Investimento', '2.1 Investimentos'],
    naturezas: [{ label: 'COMPRAS DE MOVEIS E INSTALACOES PREDIAIS' }]
  };

/** 2. Atividades de Investimento → 2.1 Investimentos → 2.1.2 Veiculos */
export const GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_VEICULOS_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'investimentos-veiculos',
  code: '2.1.2',
  label: 'Veiculos',
  parentLabels: ['2. Atividades de Investimento', '2.1 Investimentos'],
  naturezas: [
    { label: 'CONSORCIO', aliases: ['CONSORCIO - SV'] },
    {
      label: 'AQUISICAO DE FROTA - VEICULOS LEVES',
      aliases: ['AQUISICAO DE FROTA - VEICULOS LEVES - SV']
    },
    {
      label: 'AQUISICAO DE FROTA - VEICULOS PESADOS',
      aliases: ['AQUISICAO DE FROTA - VEICULOS PESADOS - SV']
    }
  ]
};

/** 2. Atividades de Investimento → 2.1 Investimentos → 2.1.3 Máquinas e TI */
export const GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_MAQUINAS_TI_BLOCK: GastosOperacionaisDfcLeafBlock = {
  id: 'investimentos-maquinas-ti',
  code: '2.1.3',
  label: 'Máquinas e TI',
  parentLabels: ['2. Atividades de Investimento', '2.1 Investimentos'],
  naturezas: [
    {
      label: 'COMPRA DE MAQUINAS E EQUIPAMENTOS',
      aliases: ['COMPRA DE MAQUINAS E EQUIPAMENTOS - SV']
    },
    { label: 'COMPRA DE COMPUTADORES E PERIFERICOS' }
  ]
};

export const GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS: readonly GastosOperacionaisDfcLeafBlock[] = [
  GASTOS_OPERACIONAIS_DFC_TRIBUTO_RETIDO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_TRIBUTO_PAGO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_REPASSES_TERCEIROS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_PESSOAL_BLOCK,
  GASTOS_OPERACIONAIS_DFC_MATERIAL_APLICADO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_SERVICOS_TERCEIRIZADOS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_CANTEIRO_OBRA_BLOCK,
  GASTOS_OPERACIONAIS_DFC_VEICULOS_LOGISTICA_BLOCK,
  GASTOS_OPERACIONAIS_DFC_TAXAS_TARIFAS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_DESPESAS_SERVICOS_TERCEIRIZADOS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INFORMATICA_SOFTWARE_BLOCK,
  GASTOS_OPERACIONAIS_DFC_COMERCIAL_MARKETING_BLOCK,
  GASTOS_OPERACIONAIS_DFC_ESCRITORIOS_ADMINISTRATIVO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_DIRETORIA_BLOCK,
  GASTOS_OPERACIONAIS_DFC_REPASSE_ADM_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_IMOVEIS_INSTALACOES_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_VEICULOS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_MAQUINAS_TI_BLOCK
];

type DfcNaturezaLookupEntry = {
  leafBlockId: string;
  canonicalLabel: string;
  sortOrder: number;
  pathLabels: readonly string[];
};

const DFC_NATUREZA_LOOKUP = new Map<string, DfcNaturezaLookupEntry>();
const POSITIVE_CREDIT_NATUREZA_KEYS = new Set<string>();

for (const block of GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS) {
  const pathLabels = [...block.parentLabels, `${block.code} ${block.label}`];
  block.naturezas.forEach((entry, index) => {
    const canonicalKey = normalizeGastosOperacionaisNaturezaKey(entry.label);
    const lookup: DfcNaturezaLookupEntry = {
      leafBlockId: block.id,
      canonicalLabel: entry.label,
      sortOrder: index,
      pathLabels
    };
    DFC_NATUREZA_LOOKUP.set(canonicalKey, lookup);
    if (entry.sumAsPositiveCredit) {
      POSITIVE_CREDIT_NATUREZA_KEYS.add(canonicalKey);
    }
    for (const alias of entry.aliases ?? []) {
      const aliasKey = normalizeGastosOperacionaisNaturezaKey(alias);
      DFC_NATUREZA_LOOKUP.set(aliasKey, lookup);
      if (entry.sumAsPositiveCredit) {
        POSITIVE_CREDIT_NATUREZA_KEYS.add(aliasKey);
      }
    }
  });
}

export function resolveGastosOperacionaisDfcEntry(
  natureza: string
): DfcNaturezaLookupEntry | null {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key || key === '—' || key === '-') return null;
  return DFC_NATUREZA_LOOKUP.get(key) ?? null;
}

export function isGastosOperacionaisDfcPessoalNatureza(natureza: string): boolean {
  return resolveGastosOperacionaisDfcEntry(natureza)?.leafBlockId === 'pessoal';
}

export function getGastosOperacionaisDfcAllowedKeys(): Set<string> {
  return new Set(DFC_NATUREZA_LOOKUP.keys());
}

export function isGastosOperacionaisPositiveCreditNatureza(natureza: string): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  return key.length > 0 && POSITIVE_CREDIT_NATUREZA_KEYS.has(key);
}

/**
 * Contribuição no total DFC: despesas como saída (negativo) e créditos como entrada (positivo).
 */
export function gastosNaturezaTotalContribution(natureza: string, total: number): number {
  if (!Number.isFinite(total) || total === 0) return 0;
  const magnitude = Math.abs(total);
  if (isGastosOperacionaisPositiveCreditNatureza(natureza)) {
    return magnitude;
  }
  return -magnitude;
}
