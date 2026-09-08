const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export type ComposicaoContextoSubServico = {
  chave?: string;
  codigo: string;
  descricao: string;
  subtitulo: string;
  unidade?: string;
  quantidade?: number;
};

export type GerarSubServicosInput = {
  servicoNome: string;
  /** Quando informado, gera etapas só deste bloco/subtítulo. */
  subtituloNome?: string;
  dataInicioObra?: string;
  dataFimObra?: string;
  composicoes: ComposicaoContextoSubServico[];
};

export type SubServicoGerado = {
  nome: string;
  composicaoChave?: string;
  observacao?: string;
};

export type GerarSubServicosResult = {
  subServicos: SubServicoGerado[];
  origem: 'ia' | 'heuristica';
};

export type EtapaPrazoInput = {
  etapaKey: string;
  servicoNome: string;
  etapaNome: string;
  valorTotal?: number;
  composicoes?: ComposicaoContextoSubServico[];
};

export type EstimarPrazosInput = {
  dataInicioObra: string;
  dataFimObra: string;
  etapas: EtapaPrazoInput[];
};

export type EtapaPrazoEstimado = {
  etapaKey: string;
  diasEstimados: number;
};

export type EstimarPrazosResult = {
  etapas: EtapaPrazoEstimado[];
  origem: 'ia' | 'heuristica';
};

function isAnthropicEnabled(): boolean {
  const flag = String(process.env.GENNECY_ANTHROPIC_ENABLED ?? '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

async function callClaude(
  system: string,
  user: string,
  timeoutMs = 90_000
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GENNECY_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[CronogramaSubServico] Claude API error', res.status, errText.slice(0, 400));
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CronogramaSubServico] Claude request failed', msg.slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonArrayPrazos(text: string): EtapaPrazoEstimado[] | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: EtapaPrazoEstimado[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const etapaKey = String(o.etapaKey ?? o.key ?? '').trim();
      const rawDias = o.diasEstimados ?? o.dias ?? o.duracaoDias ?? o.duracao;
      const diasEstimados = Math.round(Number(rawDias));
      if (!etapaKey || !Number.isFinite(diasEstimados) || diasEstimados <= 0) continue;
      out.push({ etapaKey, diasEstimados: Math.min(diasEstimados, 3650) });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function parseJsonArray(text: string): SubServicoGerado[] | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: SubServicoGerado[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const nome = String(o.nome ?? o.name ?? '').trim();
      if (!nome) continue;
      out.push({
        nome: nome.slice(0, 200),
        composicaoChave:
          typeof o.composicaoChave === 'string' && o.composicaoChave.trim()
            ? o.composicaoChave.trim()
            : undefined
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resumirDescricaoOperacional(descricao: string): string {
  let t = descricao.replace(/\s+/g, ' ').trim();
  if (t.length > 88) {
    const cut = t.slice(0, 88);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 48 ? cut.slice(0, sp) : cut).trim();
  }
  if (!t) return 'Execução da atividade';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function contextoPareceDemolicao(...textos: string[]): boolean {
  const n = normalizarTexto(textos.join(' '));
  return (
    n.includes('demolic') ||
    n.includes('retirada') ||
    n.includes('remoc') ||
    n.includes('entulho') ||
    n.includes('drywall') ||
    n.includes('divisoria')
  );
}

/** Sequência operacional típica de canteiro para um bloco/subtítulo. */
function gerarEtapasOperacionaisBloco(
  subtitulo: string,
  itens: ComposicaoContextoSubServico[],
  servicoNome: string
): SubServicoGerado[] {
  const out: SubServicoGerado[] = [];
  const demolicao = contextoPareceDemolicao(subtitulo, servicoNome);

  if (demolicao) {
    out.push({ nome: 'Mobilização e proteção das áreas de trabalho' });
  } else {
    out.push({ nome: 'Preparação e liberação da frente de serviço' });
  }

  const vistos = new Set<string>();
  for (const c of itens) {
    const id = (c.chave || c.codigo || c.descricao).trim();
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      nome: resumirDescricaoOperacional(c.descricao),
      composicaoChave: c.chave
    });
  }

  if (itens.length === 0) {
    out.push({ nome: `Execução — ${subtitulo}` });
  }

  if (demolicao) {
    out.push({ nome: 'Remoção e transporte de entulho' });
    out.push({ nome: 'Limpeza e liberação da área' });
  } else {
    out.push({ nome: 'Verificação e liberação da atividade' });
  }

  return out;
}

function fatorUnidadeParaDias(unidade: string | undefined): number {
  const u = normalizarTexto(unidade ?? 'un');
  if (u === 'm2' || u === 'm²') return 0.012;
  if (u === 'm3' || u === 'm³') return 0.06;
  if (u === 'm') return 0.015;
  if (u === 'kg') return 0.0008;
  if (u === 't') return 0.4;
  if (u === 'h') return 0.125;
  return 0.15;
}

function etapaParecePreparacao(nome: string): boolean {
  const n = normalizarTexto(nome);
  return (
    n.includes('mobiliz') ||
    n.includes('prepar') ||
    n.includes('protec') ||
    n.includes('liberacao da frente')
  );
}

function etapaPareceFinalizacao(nome: string): boolean {
  const n = normalizarTexto(nome);
  return (
    n.includes('limpeza') ||
    n.includes('entulho') ||
    n.includes('verificacao') ||
    n.includes('liberacao da area') ||
    n.includes('liberacao da atividade')
  );
}

function estimarDiasHeuristicaEtapa(etapa: EtapaPrazoInput): number {
  let dias = 0;
  const comps = (etapa.composicoes ?? []).filter((c) => c?.descricao?.trim());

  for (const c of comps) {
    const qtd = typeof c.quantidade === 'number' && c.quantidade > 0 ? c.quantidade : 0;
    const u = normalizarTexto(c.unidade ?? '');
    if (u === 'vb' && etapa.valorTotal) {
      dias += etapa.valorTotal * 0.00004;
    } else if (qtd > 0) {
      dias += qtd * fatorUnidadeParaDias(c.unidade);
    }
  }

  if (dias <= 0 && etapa.valorTotal) {
    dias = Math.max(1, etapa.valorTotal * 0.00008);
  }

  if (etapaParecePreparacao(etapa.etapaNome)) dias *= 0.25;
  else if (etapaPareceFinalizacao(etapa.etapaNome)) dias *= 0.35;

  return Math.max(1, Math.round(dias));
}

function estimarPrazosHeuristica(input: EstimarPrazosInput): EtapaPrazoEstimado[] {
  return (input.etapas ?? [])
    .filter((e) => e?.etapaKey?.trim())
    .map((etapa) => ({
      etapaKey: etapa.etapaKey.trim(),
      diasEstimados: estimarDiasHeuristicaEtapa(etapa)
    }));
}

function formatarComposicoesParaPrompt(composicoes: ComposicaoContextoSubServico[]): string {
  return composicoes
    .map((c, i) => {
      const qtd =
        typeof c.quantidade === 'number' && Number.isFinite(c.quantidade) ? c.quantidade : null;
      return `${i + 1}. [${c.codigo || '—'}] ${c.descricao}${
        c.subtitulo ? ` (subtítulo: ${c.subtitulo})` : ''
      }${qtd != null ? ` — ${qtd} ${c.unidade ?? 'un'}` : ''}`;
    })
    .join('\n');
}

function gerarHeuristica(input: GerarSubServicosInput): SubServicoGerado[] {
  const composicoes = (input.composicoes ?? []).filter((c) => c?.descricao?.trim());

  if (input.subtituloNome?.trim()) {
    return gerarEtapasOperacionaisBloco(
      input.subtituloNome.trim(),
      composicoes,
      input.servicoNome
    );
  }

  if (composicoes.length === 0) {
    return [
      { nome: 'Mobilização e preparação do serviço' },
      { nome: `Execução — ${input.servicoNome}` },
      { nome: 'Limpeza e liberação da área' }
    ];
  }

  const porSubtitulo = new Map<string, ComposicaoContextoSubServico[]>();
  for (const c of composicoes) {
    const st = c.subtitulo.trim() || input.servicoNome.trim() || 'Geral';
    const prev = porSubtitulo.get(st) ?? [];
    prev.push(c);
    porSubtitulo.set(st, prev);
  }

  if (porSubtitulo.size > 1) {
    const out: SubServicoGerado[] = [];
    for (const [subtitulo, itens] of porSubtitulo.entries()) {
      out.push(...gerarEtapasOperacionaisBloco(subtitulo, itens, input.servicoNome));
    }
    return out;
  }

  const [subtitulo, itens] = porSubtitulo.entries().next().value ?? [
    input.servicoNome,
    composicoes
  ];
  return gerarEtapasOperacionaisBloco(subtitulo, itens, input.servicoNome);
}

export class OrcamentoCronogramaSubServicoService {
  async gerarSubServicos(input: GerarSubServicosInput): Promise<GerarSubServicosResult> {
    const composicoes = (input.composicoes ?? []).filter(
      (c) => c && typeof c.descricao === 'string' && c.descricao.trim()
    );

    const focoSubtitulo = input.subtituloNome?.trim() || '';

    if (isAnthropicEnabled()) {
      const listaComp = composicoes
        .map((c, i) => {
          const qtd =
            typeof c.quantidade === 'number' && Number.isFinite(c.quantidade) ? c.quantidade : null;
          return `${i + 1}. [${c.codigo || '—'}] ${c.descricao}${
            c.subtitulo ? ` (subtítulo: ${c.subtitulo})` : ''
          }${qtd != null ? ` — ${qtd} ${c.unidade ?? 'un'}` : ''}${c.chave ? ` [chave:${c.chave}]` : ''}`;
        })
        .join('\n');

      const system = `Você é especialista em planejamento de obras civis na Gennesis Engenharia.
Proponha etapas operacionais de CRONOGRAMA FÍSICO (canteiro de obras), não itens de orçamento/SINAPI.
Responda APENAS com um JSON array válido (sem markdown):
[
  { "nome": "descrição curta da etapa", "composicaoChave": "chave opcional" }
]
Regras:
- Etapas práticas de execução: mobilização, proteção, execução, remoção de entulho, limpeza etc.
- NUNCA copie o texto longo da composição do orçamento; resuma em frase curta (até ~80 caracteres).
- NUNCA use o nome do subtítulo como única etapa.
- Ordem lógica de execução na obra.
- Para demolições/retiradas: inclua mobilização/proteção no início e remoção de entulho + limpeza no fim.
- Uma etapa de execução por composição relevante (use composicaoChave quando houver chave na lista).
- 4 a 8 etapas por bloco analisado.
- Nomes em português claro, sem códigos SINAPI/ORSE no texto.
- Não inclua campo observacao.`;

      const user = `Serviço do orçamento: ${input.servicoNome}
${focoSubtitulo ? `Subtítulo / bloco em foco: ${focoSubtitulo}\nGere etapas APENAS para este bloco.` : 'Gere etapas para todo o serviço, agrupando por subtítulo quando houver vários.'}
Prazo geral da obra: ${input.dataInicioObra || '—'} a ${input.dataFimObra || '—'}

Composições do orçamento (referência — não repetir texto literal):
${listaComp || '(nenhuma composição — proponha etapas típicas de canteiro para este serviço)'}`;

      const text = await callClaude(system, user);
      if (text) {
        const parsed = parseJsonArray(text);
        if (parsed && parsed.length > 0) {
          return { subServicos: parsed, origem: 'ia' };
        }
      }
    }

    return { subServicos: gerarHeuristica({ ...input, composicoes }), origem: 'heuristica' };
  }

  private async estimarPrazosGrupoIa(
    input: EstimarPrazosInput,
    etapas: EtapaPrazoInput[]
  ): Promise<EstimarPrazosResult> {
    if (etapas.length === 0) {
      return { etapas: [], origem: 'heuristica' };
    }

    const totalDiasObra = calcularDiasEntreIso(input.dataInicioObra, input.dataFimObra);
    const servicoNome = etapas[0]?.servicoNome ?? 'Serviço';

    const listaEtapas = etapas
      .map((e, i) => {
        const comps = formatarComposicoesParaPrompt(e.composicoes ?? []);
        const valor =
          typeof e.valorTotal === 'number' && Number.isFinite(e.valorTotal)
            ? `R$ ${e.valorTotal.toFixed(2)}`
            : '—';
        return `${i + 1}. etapaKey="${e.etapaKey}"
   Etapa: ${e.etapaNome}
   Valor ref.: ${valor}
   Composições:
${comps || '   (sem composição — estime pelo nome da etapa/serviço)'}`;
      })
      .join('\n\n');

    const system = `Você é especialista em planejamento e cronograma físico de obras civis na Gennesis Engenharia.
Estime a duração REALISTA de cada etapa de canteiro em DIAS ÚTEIS de trabalho (segunda a sexta, uma equipe típica).
Responda APENAS com um JSON array válido (sem markdown):
[
  { "etapaKey": "chave exata da etapa", "diasEstimados": 12 }
]
Regras:
- Use EXATAMENTE o etapaKey informado em cada item.
- Considere quantidade, unidade e tipo de serviço das composições.
- Mobilização, proteção e limpeza são etapas curtas (1 a 5 dias na maioria dos casos).
- Execuções volumosas (m², m³, demolições extensas) levam mais dias.
- A soma das durações deve ser coerente com o prazo total da obra informado.
- diasEstimados: inteiro >= 1.
- Não inclua outros campos.`;

    const user = `Serviço: ${servicoNome}
Prazo geral da obra: ${input.dataInicioObra || '—'} a ${input.dataFimObra || '—'}${
      totalDiasObra ? ` (${totalDiasObra} dias corridos)` : ''
    }

Etapas deste serviço (ordem de execução sequencial):
${listaEtapas}`;

    const text = await callClaude(system, user, 60_000);
    if (text) {
      const parsed = parseJsonArrayPrazos(text);
      if (parsed && parsed.length > 0) {
        const porChave = new Map(parsed.map((p) => [p.etapaKey, p.diasEstimados]));
        return {
          etapas: etapas.map((e) => ({
            etapaKey: e.etapaKey,
            diasEstimados: porChave.get(e.etapaKey) ?? estimarDiasHeuristicaEtapa(e)
          })),
          origem: 'ia'
        };
      }
    }

    return {
      etapas: etapas.map((e) => ({
        etapaKey: e.etapaKey,
        diasEstimados: estimarDiasHeuristicaEtapa(e)
      })),
      origem: 'heuristica'
    };
  }

  /** Estima duração em dias úteis de canteiro para cada etapa do cronograma. */
  async estimarPrazosEtapas(input: EstimarPrazosInput): Promise<EstimarPrazosResult> {
    const etapas = (input.etapas ?? []).filter(
      (e) => e?.etapaKey?.trim() && e?.servicoNome?.trim() && e?.etapaNome?.trim()
    );

    if (etapas.length === 0) {
      return { etapas: [], origem: 'heuristica' };
    }

    if (isAnthropicEnabled()) {
      const porServico = new Map<string, EtapaPrazoInput[]>();
      for (const etapa of etapas) {
        const grupo = porServico.get(etapa.servicoNome) ?? [];
        grupo.push(etapa);
        porServico.set(etapa.servicoNome, grupo);
      }

      const grupos = [...porServico.values()];
      let usedIa = false;
      const porChave = new Map<string, number>();

      for (let i = 0; i < grupos.length; i += 3) {
        const batch = grupos.slice(i, i + 3);
        const results = await Promise.all(
          batch.map((grupo) => this.estimarPrazosGrupoIa(input, grupo))
        );
        for (const result of results) {
          if (result.origem === 'ia') usedIa = true;
          for (const item of result.etapas) {
            porChave.set(item.etapaKey, item.diasEstimados);
          }
        }
      }

      return {
        etapas: etapas.map((e) => ({
          etapaKey: e.etapaKey,
          diasEstimados: porChave.get(e.etapaKey) ?? estimarDiasHeuristicaEtapa(e)
        })),
        origem: usedIa ? 'ia' : 'heuristica'
      };
    }

    return { etapas: estimarPrazosHeuristica(input), origem: 'heuristica' };
  }
}

function calcularDiasEntreIso(inicio: string, fim: string): number | null {
  const parse = (s: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  };
  const a = parse(inicio);
  const b = parse(fim);
  if (!a || !b) return null;
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : null;
}
