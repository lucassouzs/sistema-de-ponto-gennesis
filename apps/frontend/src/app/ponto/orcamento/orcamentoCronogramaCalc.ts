import {
  calcularStatusCronograma,
  agregarDatasSubServicosNoServicoPai,
  agruparSubServicosPorBloco,
  cronogramaUsaHierarquiaSubtitulos,
  diasEntre,
  filtrarSubServicosOperacionaisCronograma,
  formatDataIso,
  listarEtapasCronogramaBloco,
  listarSubServicos,
  listarSubtitulosVisiveisCronograma,
  ordenarSubServicosSequenciaObra,
  parseDataIso,
  resolverDadosCronogramaBloco,
  resolverDadosCronogramaComposicao,
  resolverDadosCronogramaServico,
  resolverDadosCronogramaServicoParaLinha,
  resolverDadosCronogramaSubServico,
  etapaCronogramaEhSintetica,
  type CronogramaComposicaoRef,
  type CronogramaItemData,
  type CronogramaLinhaServico,
  type CronogramaPersist,
  type CronogramaStatus,
  type CronogramaSubServico,
  type EtapaPrazoPayload
} from './orcamentoCronogramaTypes';

export type CronogramaResumo = {
  totalServicos: number;
  /** Etapas rastreáveis (subserviços ou serviço sem subs). */
  totalEtapas: number;
  servicosComDatas: number;
  etapasSemDatasReais: number;
  progressoFisico: number;
  progressoFinanceiro: number;
  valorTotal: number;
  valorExecutado: number;
  porStatus: Record<CronogramaStatus, number>;
  dataInicioMin: Date | null;
  dataFimMax: Date | null;
};

type EtapaCronogramaResumo = {
  servicoKey: string;
  subId?: string;
  dados: CronogramaItemData;
  peso: number;
};

export function etapaKeyCronograma(servicoKey: string, subId?: string): string {
  return subId ? `${servicoKey}|${subId}` : servicoKey;
}

function composicoesParaSub(
  linha: CronogramaLinhaServico,
  sub: CronogramaSubServico
): CronogramaComposicaoRef[] {
  if (sub.composicaoChave) {
    const pool: CronogramaComposicaoRef[] = [...(linha.composicoes ?? [])];
    for (const st of linha.subtitulos ?? []) {
      pool.push(...st.composicoes);
    }
    const found = pool.filter((c) => c.chave === sub.composicaoChave);
    if (found.length > 0) return found;
  }
  if (sub.subtituloBlocoKey) {
    const st = linha.subtitulos?.find((s) => s.blocoKey === sub.subtituloBlocoKey);
    if (st?.composicoes.length) return st.composicoes;
  }
  return linha.composicoes ?? [];
}

/** Monta payload para a API estimar duração de cada etapa do cronograma. */
export function montarPayloadEstimativaPrazoCronograma(
  linhas: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): EtapaPrazoPayload[] {
  const etapas: EtapaPrazoPayload[] = [];
  for (const linha of linhas) {
    const subs = ordenarSubServicosSequenciaObra(
      filtrarSubServicosOperacionaisCronograma(
        linha,
        listarSubServicos(cronograma, linha.servicoKey)
      )
    );
    if (subs.length === 0) {
      etapas.push({
        etapaKey: etapaKeyCronograma(linha.servicoKey),
        servicoNome: linha.servicoNome,
        etapaNome: linha.servicoNome,
        valorTotal: linha.valorTotal,
        composicoes: linha.composicoes ?? []
      });
      continue;
    }
    const pesoSub = Math.max(linha.valorTotal, 1) / subs.length;
    for (const sub of subs) {
      etapas.push({
        etapaKey: etapaKeyCronograma(linha.servicoKey, sub.id),
        servicoNome: linha.servicoNome,
        etapaNome: sub.nome,
        valorTotal: pesoSub,
        composicoes: composicoesParaSub(linha, sub)
      });
    }
  }
  return etapas;
}

function listarEtapasCronograma(
  servicos: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): EtapaCronogramaResumo[] {
  const etapas: EtapaCronogramaResumo[] = [];
  for (const linha of servicos) {
    const subs = ordenarSubServicosSequenciaObra(
      filtrarSubServicosOperacionaisCronograma(
        linha,
        listarSubServicos(cronograma, linha.servicoKey)
      )
    );
    const pesoBase = Math.max(linha.valorTotal, 1);
    if (subs.length === 0) {
      etapas.push({
        servicoKey: linha.servicoKey,
        dados: resolverDadosCronogramaServico(cronograma, linha.servicoKey),
        peso: pesoBase
      });
      continue;
    }
    const pesoSub = pesoBase / subs.length;
    subs.forEach((sub, idx) => {
      etapas.push({
        servicoKey: linha.servicoKey,
        subId: sub.id,
        dados: resolverDadosCronogramaSubServico(cronograma, linha.servicoKey, sub, idx, subs.length),
        peso: pesoSub
      });
    });
  }
  return etapas;
}

function alocarDiasPorPeso(totalDias: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  if (totalDias <= 0) return pesos.map(() => 0);
  if (pesos.length === 1) return [totalDias];

  const pesoTotal = pesos.reduce((acc, p) => acc + p, 0) || pesos.length;
  const dias = pesos.map((p) => Math.max(1, Math.floor((totalDias * p) / pesoTotal)));
  let soma = dias.reduce((acc, d) => acc + d, 0);

  while (soma > totalDias) {
    const idx = dias.findIndex((d) => d > 1);
    if (idx < 0) break;
    dias[idx]--;
    soma--;
  }

  let i = 0;
  while (soma < totalDias) {
    dias[i % dias.length]++;
    soma++;
    i++;
  }

  return dias;
}

function sincronizarDatasServicosPaiComSubs(
  linhas: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): CronogramaPersist {
  const next: CronogramaPersist = {
    ...cronograma,
    porServico: { ...cronograma.porServico }
  };

  for (const linha of linhas) {
    const agg = agregarDatasSubServicosNoServicoPai(next, linha.servicoKey);
    if (!agg) continue;
    next.porServico[linha.servicoKey] = {
      ...(next.porServico[linha.servicoKey] ?? {}),
      ...agg
    };
  }

  return next;
}

/** Copia datas planejadas (efetivas) para início/fim real de cada etapa. */
export function copiarDatasPlanParaRealCronograma(
  linhas: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): CronogramaPersist {
  const next: CronogramaPersist = {
    ...cronograma,
    porServico: { ...cronograma.porServico },
    subServicosPorServico: { ...(cronograma.subServicosPorServico ?? {}) }
  };

  for (const linha of linhas) {
    const subs = listarSubServicos(cronograma, linha.servicoKey);
    if (subs.length === 0) {
      const dados = resolverDadosCronogramaServico(cronograma, linha.servicoKey);
      if (!dados.dataInicio || !dados.dataFim) continue;
      next.porServico[linha.servicoKey] = {
        ...(next.porServico[linha.servicoKey] ?? {}),
        dataInicioReal: dados.dataInicio,
        dataFimReal: dados.dataFim
      };
      continue;
    }

    next.subServicosPorServico![linha.servicoKey] = subs.map((sub, idx) => {
      const dados = resolverDadosCronogramaSubServico(cronograma, linha.servicoKey, sub, idx, subs.length);
      if (!dados.dataInicio || !dados.dataFim) return sub;
      return {
        ...sub,
        dataInicioReal: dados.dataInicio,
        dataFimReal: dados.dataFim
      };
    });
  }

  return sincronizarDatasServicosPaiComSubs(linhas, next);
}

/** Distribui o prazo geral da obra entre etapas, sequencial e proporcional ao peso (valor ou estimativa). */
export function distribuirPrazoGeralCronograma(
  linhas: CronogramaLinhaServico[],
  cronograma: CronogramaPersist,
  inicioIso: string,
  fimIso: string,
  pesosPorEtapa?: Record<string, number>
): CronogramaPersist | null {
  const ini = parseDataIso(inicioIso);
  const fim = parseDataIso(fimIso);
  const totalDias = diasEntre(inicioIso, fimIso);
  if (!ini || !fim || !totalDias) return null;

  const etapas = listarEtapasCronograma(linhas, cronograma);
  if (etapas.length === 0) return null;

  const diasPorEtapa = alocarDiasPorPeso(
    totalDias,
    etapas.map((e) => {
      const key = etapaKeyCronograma(e.servicoKey, e.subId);
      const custom = pesosPorEtapa?.[key];
      return custom && custom > 0 ? custom : e.peso;
    })
  );

  const next: CronogramaPersist = {
    ...cronograma,
    porServico: { ...cronograma.porServico },
    subServicosPorServico: { ...(cronograma.subServicosPorServico ?? {}) }
  };

  let cursor = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate(), 12, 0, 0, 0);

  etapas.forEach((etapa, idx) => {
    const span = diasPorEtapa[idx] ?? 1;
    const inicio = formatDataIso(cursor);
    const fimEtapa = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + span - 1,
      12,
      0,
      0,
      0
    );
    const fimStr = formatDataIso(fimEtapa);

    if (etapa.subId) {
      const subs = [...listarSubServicos(next, etapa.servicoKey)];
      const subIdx = subs.findIndex((s) => s.id === etapa.subId);
      if (subIdx >= 0) {
        subs[subIdx] = { ...subs[subIdx], dataInicio: inicio, dataFim: fimStr };
        next.subServicosPorServico![etapa.servicoKey] = subs;
      }
    } else {
      next.porServico[etapa.servicoKey] = {
        ...(next.porServico[etapa.servicoKey] ?? {}),
        dataInicio: inicio,
        dataFim: fimStr
      };
    }

    cursor = new Date(
      fimEtapa.getFullYear(),
      fimEtapa.getMonth(),
      fimEtapa.getDate() + 1,
      12,
      0,
      0,
      0
    );
  });

  return sincronizarDatasServicosPaiComSubs(linhas, next);
}

export function calcularResumoCronograma(
  servicos: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): CronogramaResumo {
  const porStatus: CronogramaResumo['porStatus'] = {
    pendente: 0,
    em_andamento: 0,
    concluido: 0,
    atrasado: 0
  };
  let valorTotal = 0;
  let valorExecutado = 0;
  let somaPeso = 0;
  let somaPesoPct = 0;
  let servicosComDatas = 0;
  let etapasSemDatasReais = 0;
  let dataInicioMin: Date | null = null;
  let dataFimMax: Date | null = null;

  const considerarData = (ds: string | undefined) => {
    const d = parseDataIso(ds);
    if (!d) return;
    if (!dataInicioMin || d < dataInicioMin) dataInicioMin = d;
    if (!dataFimMax || d > dataFimMax) dataFimMax = d;
  };

  const etapas = listarEtapasCronograma(servicos, cronograma);

  for (const linha of servicos) {
    valorTotal += linha.valorTotal;
  }

  for (const etapa of etapas) {
    const { dados, peso } = etapa;
    const status = calcularStatusCronograma(dados);
    porStatus[status]++;
    const pct = dados.percentualExecutado ?? 0;
    valorExecutado += peso * (pct / 100);
    somaPeso += peso;
    somaPesoPct += peso * pct;

    if (dados.dataInicio && dados.dataFim) servicosComDatas++;
    if (!(dados.dataInicioReal?.trim() && dados.dataFimReal?.trim())) etapasSemDatasReais++;

    considerarData(dados.dataInicio);
    considerarData(dados.dataFim);
    considerarData(dados.dataInicioReal);
    considerarData(dados.dataFimReal);
  }

  return {
    totalServicos: servicos.length,
    totalEtapas: etapas.length,
    servicosComDatas,
    etapasSemDatasReais,
    progressoFisico: somaPeso > 0 ? somaPesoPct / somaPeso : 0,
    progressoFinanceiro: valorTotal > 0 ? (valorExecutado / valorTotal) * 100 : 0,
    valorTotal,
    valorExecutado,
    porStatus,
    dataInicioMin,
    dataFimMax
  };
}

export type CronogramaTimelineMes = {
  key: string;
  label: string;
  inicio: Date;
  fim: Date;
};

export type CronogramaTimelineColunaDia = {
  key: string;
  label: string;
  data: Date;
  index: number;
  mesKey: string;
  mesLabel: string;
};

export type CronogramaTimelineMesGrupo = {
  key: string;
  label: string;
  span: number;
};

export const TIMELINE_LARGURA_DIA_PX = 34;

function indiceDiaNoRange(inicioRange: Date, data: Date): number {
  const a = new Date(inicioRange.getFullYear(), inicioRange.getMonth(), inicioRange.getDate(), 12, 0, 0, 0);
  const b = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function totalDiasTimeline(inicio: Date, fim: Date): number {
  return indiceDiaNoRange(inicio, fim) + 1;
}

/** Uma coluna por dia — base da escala visual. */
export function gerarColunasDiasTimeline(inicio: Date, fim: Date): CronogramaTimelineColunaDia[] {
  const colunas: CronogramaTimelineColunaDia[] = [];
  let cur = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 12, 0, 0, 0);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 12, 0, 0, 0);
  let index = 0;
  while (cur <= limite) {
    const mesKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    const mesLabel = cur.toLocaleDateString('pt-BR', {
      month: 'short',
      year: '2-digit',
      timeZone: 'America/Sao_Paulo'
    });
    colunas.push({
      key: `${mesKey}-${String(cur.getDate()).padStart(2, '0')}`,
      label: String(cur.getDate()),
      data: new Date(cur),
      index,
      mesKey,
      mesLabel
    });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 12, 0, 0, 0);
    index++;
  }
  return colunas;
}

export function gerarGruposMesTimeline(colunas: CronogramaTimelineColunaDia[]): CronogramaTimelineMesGrupo[] {
  const grupos: CronogramaTimelineMesGrupo[] = [];
  for (const col of colunas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.key === col.mesKey) {
      ultimo.span += 1;
    } else {
      grupos.push({ key: col.mesKey, label: col.mesLabel, span: 1 });
    }
  }
  return grupos;
}

export function posicaoBarraTimelinePx(
  inicioRange: Date,
  fimRange: Date,
  inicioBarra: Date,
  fimBarra: Date,
  larguraDiaPx: number = TIMELINE_LARGURA_DIA_PX
): { leftPx: number; widthPx: number } | null {
  const idx = indicesBarraTimeline(inicioRange, fimRange, inicioBarra, fimBarra);
  if (!idx) return null;

  return {
    leftPx: idx.startIdx * larguraDiaPx + 2,
    widthPx: Math.max(larguraDiaPx - 4, idx.span * larguraDiaPx - 4)
  };
}

/** @deprecated use gerarColunasDiasTimeline */
export type CronogramaTimelineMarcador = {
  key: string;
  label: string;
  data: Date;
  leftPct: number;
};

function passoMarcadoresDias(totalDias: number): number {
  if (totalDias <= 31) return 1;
  if (totalDias <= 60) return 2;
  if (totalDias <= 90) return 5;
  if (totalDias <= 180) return 7;
  return 14;
}

/** @deprecated */
export function gerarMarcadoresDiasTimeline(inicio: Date, fim: Date): CronogramaTimelineMarcador[] {
  const totalDias = totalDiasTimeline(inicio, fim);
  if (totalDias <= 0) return [];
  const step = passoMarcadoresDias(totalDias);
  const marcadores: CronogramaTimelineMarcador[] = [];
  const vistos = new Set<string>();
  const pushDia = (d: Date) => {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (vistos.has(key)) return;
    vistos.add(key);
    const { leftPct } = posicaoBarraTimeline(inicio, fim, d, d);
    marcadores.push({
      key,
      label: String(d.getDate()),
      data: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0),
      leftPct
    });
  };
  let cur = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 12, 0, 0, 0);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 12, 0, 0, 0);
  while (cur <= limite) {
    pushDia(cur);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + step, 12, 0, 0, 0);
  }
  pushDia(limite);
  return marcadores.sort((a, b) => a.leftPct - b.leftPct);
}

export function gerarMesesTimeline(inicio: Date, fim: Date): CronogramaTimelineMes[] {
  const meses: CronogramaTimelineMes[] = [];
  let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1, 12, 0, 0, 0);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), 1, 12, 0, 0, 0);
  while (cur <= limite) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const ultimoDia = new Date(y, m + 1, 0, 12, 0, 0, 0);
    meses.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' }),
      inicio: new Date(y, m, 1, 12, 0, 0, 0),
      fim: ultimoDia
    });
    cur = new Date(y, m + 1, 1, 12, 0, 0, 0);
  }
  return meses;
}

function indicesBarraTimeline(
  inicioRange: Date,
  fimRange: Date,
  inicioBarra: Date,
  fimBarra: Date
): { startIdx: number; span: number; totalDias: number } | null {
  const totalDias = totalDiasTimeline(inicioRange, fimRange);
  if (totalDias <= 0) return null;

  const startIdx = Math.max(0, indiceDiaNoRange(inicioRange, inicioBarra));
  const endIdx = Math.min(totalDias - 1, indiceDiaNoRange(inicioRange, fimBarra));
  if (endIdx < startIdx) return null;

  return { startIdx, span: endIdx - startIdx + 1, totalDias };
}

export function posicaoBarraTimeline(
  inicioRange: Date,
  fimRange: Date,
  inicioBarra: Date,
  fimBarra: Date
): { leftPct: number; widthPct: number } {
  const idx = indicesBarraTimeline(inicioRange, fimRange, inicioBarra, fimBarra);
  if (!idx) return { leftPct: 0, widthPct: 0 };
  return {
    leftPct: (idx.startIdx / idx.totalDias) * 100,
    widthPct: (idx.span / idx.totalDias) * 100
  };
}

export type CronogramaTimelineMarcadorHoje = {
  leftPct: number;
  colIndex: number;
  label: string;
};

/** Posição do instante atual na grade (interpola dentro da coluna do dia), se estiver no intervalo visível. */
export function calcularMarcadorHojeTimeline(
  inicioRange: Date,
  fimRange: Date,
  hoje: Date = new Date()
): CronogramaTimelineMarcadorHoje | null {
  const diaRef = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0, 0);
  const totalDias = totalDiasTimeline(inicioRange, fimRange);
  if (totalDias <= 0) return null;

  const idx = indiceDiaNoRange(inicioRange, diaRef);
  if (idx < 0 || idx >= totalDias) return null;

  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
  const fracaoDia = Math.min(1, Math.max(0, (hoje.getTime() - inicioDia.getTime()) / (24 * 60 * 60 * 1000)));

  return {
    leftPct: ((idx + fracaoDia) / totalDias) * 100,
    colIndex: idx,
    label: hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  };
}

export type CronogramaTimelineLinha = {
  key: string;
  servicoKey: string;
  subId?: string;
  blocoKey?: string;
  composicaoChave?: string;
  label: string;
  isSub: boolean;
  /** Serviço pai — exibe só o título, sem faixa de barra. */
  isCabecalhoServico: boolean;
  /** Subtítulo do orçamento — faixa intermediária. */
  isCabecalhoSubtitulo?: boolean;
  indentLevel?: 0 | 1 | 2;
  dados: CronogramaItemData;
  showBar: boolean;
  editavel: boolean;
};

export type CronogramaTimelineZoom = 'semana' | 'mes' | 'obra';

export type CronogramaTimelineRange = {
  inicio: Date;
  fim: Date;
  colunas: CronogramaTimelineColunaDia[];
  meses: CronogramaTimelineMesGrupo[];
  larguraDiaPx: number;
  larguraTotalPx: number;
};

export const TIMELINE_LARGURA_DIA_SEMANA_PX = 96;
export const TIMELINE_LARGURA_DIA_MES_PX = 40;

function inicioSemana(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 12, 0, 0, 0);
}

function larguraDiaParaObra(totalDias: number): number {
  if (totalDias <= 31) return TIMELINE_LARGURA_DIA_PX;
  if (totalDias <= 60) return 28;
  if (totalDias <= 120) return 22;
  if (totalDias <= 240) return 16;
  return Math.max(8, Math.floor(8000 / totalDias));
}

function cronogramaTemDatasPlan(dados: CronogramaItemData): boolean {
  return Boolean(parseDataIso(dados.dataInicio) && parseDataIso(dados.dataFim));
}

function cronogramaTemDatasReais(dados: CronogramaItemData): boolean {
  return Boolean(parseDataIso(dados.dataInicioReal) && parseDataIso(dados.dataFimReal));
}

function cronogramaTemDatasTimeline(dados: CronogramaItemData): boolean {
  return cronogramaTemDatasPlan(dados) || cronogramaTemDatasReais(dados);
}

function montarFilhasSubtituloTimeline(
  rows: CronogramaTimelineLinha[],
  linha: CronogramaLinhaServico,
  cronograma: CronogramaPersist,
  st: import('./orcamentoCronogramaTypes').CronogramaLinhaSubtitulo,
  subsDoBloco: import('./orcamentoCronogramaTypes').CronogramaSubServico[]
) {
  const etapasBloco = listarEtapasCronogramaBloco(st, subsDoBloco);

  etapasBloco.forEach((sub, idx) => {
    const porItem =
      etapaCronogramaEhSintetica(sub) && sub.composicaoChave
        ? resolverDadosCronogramaComposicao(cronograma, st.blocoKey, {
            chave: sub.composicaoChave,
            codigo: '',
            descricao: sub.nome,
            subtituloNome: st.subtituloNome,
            quantidade: 0
          })
        : null;
    const subDados =
      porItem?.dataInicio && porItem?.dataFim
        ? porItem
        : resolverDadosCronogramaSubServico(
            cronograma,
            linha.servicoKey,
            sub,
            idx,
            etapasBloco.length
          );
    rows.push({
      key: `${linha.servicoKey}::${sub.id}`,
      servicoKey: linha.servicoKey,
      subId: etapaCronogramaEhSintetica(sub) ? undefined : sub.id,
      blocoKey: st.blocoKey,
      composicaoChave: etapaCronogramaEhSintetica(sub) ? sub.composicaoChave : undefined,
      label: sub.nome,
      isSub: true,
      isCabecalhoServico: false,
      indentLevel: 2,
      dados: subDados,
      showBar: cronogramaTemDatasTimeline(subDados),
      editavel: true
    });
  });
}

export function montarLinhasTimeline(
  linhas: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): CronogramaTimelineLinha[] {
  const rows: CronogramaTimelineLinha[] = [];
  for (const linha of linhas) {
    const subs = filtrarSubServicosOperacionaisCronograma(
      linha,
      listarSubServicos(cronograma, linha.servicoKey)
    );
    const dados = resolverDadosCronogramaServicoParaLinha(cronograma, linha);
    const usaHierarquia = cronogramaUsaHierarquiaSubtitulos(linha);
    const subtitulosVisiveis = listarSubtitulosVisiveisCronograma(linha);
    const temFilhas = subs.length > 0;

    rows.push({
      key: linha.servicoKey,
      servicoKey: linha.servicoKey,
      label: linha.servicoNome,
      isSub: false,
      isCabecalhoServico: temFilhas,
      indentLevel: 0,
      dados,
      showBar: !temFilhas && cronogramaTemDatasTimeline(dados),
      editavel: !temFilhas
    });

    if (!usaHierarquia) {
      const subsOrdenados = ordenarSubServicosSequenciaObra(subs);
      subsOrdenados.forEach((sub, idx) => {
        const subDados = resolverDadosCronogramaSubServico(
          cronograma,
          linha.servicoKey,
          sub,
          idx,
          subsOrdenados.length
        );
        rows.push({
          key: `${linha.servicoKey}::${sub.id}`,
          servicoKey: linha.servicoKey,
          subId: sub.id,
          label: sub.nome,
          isSub: true,
          isCabecalhoServico: false,
          indentLevel: 1,
          dados: subDados,
          showBar: cronogramaTemDatasTimeline(subDados),
          editavel: true
        });
      });
      continue;
    }

    const subsPorBloco = agruparSubServicosPorBloco(linha, subs);

    for (const st of subtitulosVisiveis) {
      const subsDoBloco = ordenarSubServicosSequenciaObra(subsPorBloco.get(st.blocoKey) ?? []);
      const etapasBloco = listarEtapasCronogramaBloco(st, subsDoBloco);
      const dadosBloco = resolverDadosCronogramaBloco(
        cronograma,
        st.blocoKey,
        etapasBloco,
        linha.servicoKey
      );

      rows.push({
        key: `${st.blocoKey}::cabecalho`,
        servicoKey: linha.servicoKey,
        blocoKey: st.blocoKey,
        label: st.subtituloNome,
        isSub: false,
        isCabecalhoServico: false,
        isCabecalhoSubtitulo: true,
        indentLevel: 1,
        dados: dadosBloco,
        showBar: etapasBloco.length > 0 && cronogramaTemDatasTimeline(dadosBloco),
        editavel: false
      });

      montarFilhasSubtituloTimeline(rows, linha, cronograma, st, subsDoBloco);
    }
  }
  return rows;
}

export function calcularTimelineRange(
  linhas: CronogramaLinhaServico[],
  cronograma: CronogramaPersist
): CronogramaTimelineRange | null {
  let dataInicioMin: Date | null = null;
  let dataFimMax: Date | null = null;

  const considerar = (ds: string | undefined) => {
    const d = parseDataIso(ds);
    if (!d) return;
    if (!dataInicioMin || d < dataInicioMin) dataInicioMin = d;
    if (!dataFimMax || d > dataFimMax) dataFimMax = d;
  };

  for (const linha of linhas) {
    const subs = listarSubServicos(cronograma, linha.servicoKey);
    if (subs.length === 0) {
      const dados = resolverDadosCronogramaServico(cronograma, linha.servicoKey);
      considerar(dados.dataInicio);
      considerar(dados.dataFim);
      considerar(dados.dataInicioReal);
      considerar(dados.dataFimReal);
      continue;
    }
    subs.forEach((sub, idx) => {
      const subDados = resolverDadosCronogramaSubServico(cronograma, linha.servicoKey, sub, idx, subs.length);
      considerar(subDados.dataInicio);
      considerar(subDados.dataFim);
      considerar(subDados.dataInicioReal);
      considerar(subDados.dataFimReal);
    });
  }

  if (!dataInicioMin) dataInicioMin = parseDataIso(cronograma.config?.dataInicioObra);
  if (!dataFimMax) dataFimMax = parseDataIso(cronograma.config?.dataFimObra);
  if (!dataInicioMin || !dataFimMax) return null;

  const padIni = new Date(
    dataInicioMin.getFullYear(),
    dataInicioMin.getMonth(),
    dataInicioMin.getDate(),
    12,
    0,
    0,
    0
  );
  const padFim = new Date(
    dataFimMax.getFullYear(),
    dataFimMax.getMonth(),
    dataFimMax.getDate(),
    12,
    0,
    0,
    0
  );
  const colunas = gerarColunasDiasTimeline(padIni, padFim);
  const larguraDiaPx = larguraDiaParaObra(colunas.length);
  return {
    inicio: padIni,
    fim: padFim,
    colunas,
    meses: gerarGruposMesTimeline(colunas),
    larguraDiaPx,
    larguraTotalPx: colunas.length * larguraDiaPx
  };
}

/** Recorta ou expande o intervalo visível conforme zoom (semana / mês / obra inteira). */
export function calcularTimelineRangeVisivel(
  rangeObra: CronogramaTimelineRange,
  zoom: CronogramaTimelineZoom,
  anchor: Date,
  panOffset = 0
): CronogramaTimelineRange {
  if (zoom === 'obra') {
    return rangeObra;
  }

  let inicio: Date;
  let fim: Date;
  let larguraDiaPx: number;

  if (zoom === 'semana') {
    inicio = inicioSemana(anchor);
    inicio = new Date(
      inicio.getFullYear(),
      inicio.getMonth(),
      inicio.getDate() + panOffset * 7,
      12,
      0,
      0,
      0
    );
    fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6, 12, 0, 0, 0);
    larguraDiaPx = TIMELINE_LARGURA_DIA_SEMANA_PX;
  } else {
    const y = anchor.getFullYear();
    const m = anchor.getMonth() + panOffset;
    inicio = new Date(y, m, 1, 12, 0, 0, 0);
    fim = new Date(y, m + 1, 0, 12, 0, 0, 0);
    larguraDiaPx = TIMELINE_LARGURA_DIA_MES_PX;
  }

  const colunas = gerarColunasDiasTimeline(inicio, fim);
  return {
    inicio,
    fim,
    colunas,
    meses: gerarGruposMesTimeline(colunas),
    larguraDiaPx,
    larguraTotalPx: colunas.length * larguraDiaPx
  };
}

function diffDiasAssinado(de: Date, para: Date): number {
  const a = new Date(de.getFullYear(), de.getMonth(), de.getDate(), 12, 0, 0, 0);
  const b = new Date(para.getFullYear(), para.getMonth(), para.getDate(), 12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function progressoPlanEtapaNaData(d: Date, inicio?: string, fim?: string): number {
  const ini = parseDataIso(inicio);
  const end = parseDataIso(fim);
  if (!ini || !end) return 0;
  if (d < ini) return 0;
  if (d >= end) return 1;
  const total = diffDiasAssinado(ini, end) + 1;
  if (total <= 0) return 0;
  const elapsed = diffDiasAssinado(ini, d) + 1;
  return Math.min(1, Math.max(0, elapsed / total));
}

function progressoRealEtapaNaData(d: Date, dados: CronogramaItemData): number {
  const pct = Math.min(100, Math.max(0, dados.percentualExecutado ?? 0)) / 100;
  const ini = parseDataIso(dados.dataInicioReal);
  const end = parseDataIso(dados.dataFimReal);
  if (!ini || !end) return 0;
  if (d < ini) return 0;
  if (d >= end) return pct;
  const total = diffDiasAssinado(ini, end) + 1;
  if (total <= 0) return 0;
  const elapsed = diffDiasAssinado(ini, d) + 1;
  return pct * Math.min(1, Math.max(0, elapsed / total));
}

export type CronogramaDesvioTimeline = {
  desvioInicioDias: number | null;
  desvioFimDias: number | null;
  temDesvio: boolean;
};

/** Diferença em dias (real − plan): positivo = atraso, negativo = adiantamento. */
export function calcularDesvioTimeline(dados: CronogramaItemData): CronogramaDesvioTimeline {
  const planIni = parseDataIso(dados.dataInicio);
  const planFim = parseDataIso(dados.dataFim);
  const realIni = parseDataIso(dados.dataInicioReal);
  const realFim = parseDataIso(dados.dataFimReal);

  const desvioInicioDias =
    planIni && realIni ? diffDiasAssinado(planIni, realIni) : null;
  const desvioFimDias = planFim && realFim ? diffDiasAssinado(planFim, realFim) : null;
  const temDesvio =
    (desvioInicioDias !== null && desvioInicioDias !== 0) ||
    (desvioFimDias !== null && desvioFimDias !== 0);

  return { desvioInicioDias, desvioFimDias, temDesvio };
}

export function formatDesvioDiasLabel(dias: number | null): string | null {
  if (dias === null || dias === 0) return null;
  const abs = Math.abs(dias);
  const unidade = abs === 1 ? '1 dia' : `${abs} dias`;
  if (dias > 0) return `+${unidade} (atraso)`;
  return `−${unidade} (adiant.)`;
}

export function formatDesvioDiasCurto(dias: number | null): string | null {
  if (dias === null || dias === 0) return null;
  const abs = Math.abs(dias);
  const s = abs === 1 ? '1d' : `${abs}d`;
  return dias > 0 ? `+${s}` : `−${s}`;
}

export type CronogramaCurvaSPonto = {
  key: string;
  label: string;
  dataIso: string;
  planPct: number;
  realPct: number;
};

function passoAmostragemCurvaS(totalDias: number): number {
  if (totalDias <= 31) return 1;
  if (totalDias <= 90) return 7;
  if (totalDias <= 180) return 14;
  return Math.max(1, Math.ceil(totalDias / 52));
}

/** Curva S: % físico acumulado planejado vs real ao longo do prazo da obra. */
export function calcularCurvaSCronograma(
  servicos: CronogramaLinhaServico[],
  cronograma: CronogramaPersist,
  dataInicioObra?: string,
  dataFimObra?: string
): CronogramaCurvaSPonto[] {
  const etapas = listarEtapasCronograma(servicos, cronograma);
  if (etapas.length === 0) return [];

  const resumo = calcularResumoCronograma(servicos, cronograma);
  const ini =
    parseDataIso(dataInicioObra) ??
    resumo.dataInicioMin ??
    parseDataIso(cronograma.config?.dataInicioObra);
  const fim =
    parseDataIso(dataFimObra) ??
    resumo.dataFimMax ??
    parseDataIso(cronograma.config?.dataFimObra);

  if (!ini || !fim || fim < ini) return [];

  const pesoTotal = etapas.reduce((acc, e) => acc + e.peso, 0) || etapas.length;
  const totalDias = diffDiasAssinado(ini, fim) + 1;
  const step = passoAmostragemCurvaS(totalDias);
  const pontos: CronogramaCurvaSPonto[] = [];

  for (let offset = 0; offset < totalDias; offset += step) {
    const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + offset, 12, 0, 0, 0);
    if (d > fim) break;

    let somaPlan = 0;
    let somaReal = 0;
    for (const etapa of etapas) {
      somaPlan += etapa.peso * progressoPlanEtapaNaData(d, etapa.dados.dataInicio, etapa.dados.dataFim);
      somaReal += etapa.peso * progressoRealEtapaNaData(d, etapa.dados);
    }

    pontos.push({
      key: formatDataIso(d),
      dataIso: formatDataIso(d),
      label: d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo'
      }),
      planPct: Math.round((somaPlan / pesoTotal) * 1000) / 10,
      realPct: Math.round((somaReal / pesoTotal) * 1000) / 10
    });
  }

  const ultimo = pontos[pontos.length - 1];
  const fimIso = formatDataIso(fim);
  if (!ultimo || ultimo.dataIso !== fimIso) {
    let somaPlan = 0;
    let somaReal = 0;
    for (const etapa of etapas) {
      somaPlan += etapa.peso * progressoPlanEtapaNaData(fim, etapa.dados.dataInicio, etapa.dados.dataFim);
      somaReal += etapa.peso * progressoRealEtapaNaData(fim, etapa.dados);
    }
    pontos.push({
      key: fimIso,
      dataIso: fimIso,
      label: fim.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo'
      }),
      planPct: Math.round((somaPlan / pesoTotal) * 1000) / 10,
      realPct: Math.round((somaReal / pesoTotal) * 1000) / 10
    });
  }

  return pontos;
}
