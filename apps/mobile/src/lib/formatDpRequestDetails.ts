/** Formata `details` da solicitação DP/ADM para exibir no mobile. */

export type DpDetailItem = {
  title: string;
  subtitle: string;
};

export type DpDetailsPreview = {
  sectionTitle: string;
  items: DpDetailItem[];
};

function str(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function dash(v: string | null | undefined): string {
  return v && v.trim() ? v.trim() : '—';
}

function formatYmd(ymd: unknown): string {
  if (typeof ymd !== 'string') return '—';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDateTimeLocal(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const raw = value.trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR');
}

function parseObjectArray(
  d: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const raw = d[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function extractEmployeeIds(d: Record<string, unknown>): string[] {
  if (Array.isArray(d.employeeIds)) {
    return d.employeeIds.filter((id): id is string => typeof id === 'string' && !!id.trim());
  }
  if (typeof d.employeeId === 'string' && d.employeeId.trim()) {
    return [d.employeeId.trim()];
  }
  return [];
}

function employeeName(
  row: Record<string, unknown>,
  nameById?: Map<string, string>,
): string {
  const id = str(row.employeeId);
  if (!id) return '—';
  return nameById?.get(id) ?? id;
}

function attachmentName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  return String((raw as Record<string, unknown>).fileName ?? '').trim();
}

function punicaoLabel(punicao: string) {
  if (punicao === 'ADVERTENCIA') return 'Advertência';
  if (punicao === 'SUSPENSAO') return 'Suspensão';
  return punicao || '—';
}

const MOTIVO_CONTRATACAO_LABELS: Record<string, string> = {
  AUMENTO_QUADRO: 'Aumento de quadro',
  SUBSTITUICAO: 'Substituição',
  DEMANDA_TEMPORARIA: 'Demanda temporária / obra',
  OUTRO: 'Outro',
};

const ASO_TIPO_LABELS: Record<string, string> = {
  ADMISSIONAL: 'Admissional',
  PERIODICO: 'Periódico',
  RETORNO_TRABALHO: 'Retorno ao trabalho',
  DEMISSIONAL: 'Demissional',
  ALTERACAO_FUNCAO: 'Alteração de função',
};

function legacyEmployeeRows(
  d: Record<string, unknown>,
  shared: Record<string, unknown>,
): Record<string, unknown>[] {
  return extractEmployeeIds(d).map((employeeId) => ({ employeeId, ...shared }));
}

function listItems(
  items: Record<string, unknown>[],
  nameById: Map<string, string> | undefined,
  formatSubtitle: (row: Record<string, unknown>) => string,
): DpDetailItem[] {
  return items.map((row) => ({
    title: employeeName(row, nameById),
    subtitle: formatSubtitle(row),
  }));
}

export function formatDpRequestDetails(
  requestType: string,
  details: Record<string, unknown> | null | undefined,
  employeeNameById?: Map<string, string>,
): DpDetailsPreview | null {
  if (!details || typeof details !== 'object') return null;
  const d = details;
  const nameById = employeeNameById;

  if (requestType === 'ADMISSAO') {
    const legacyMotivo = str(d.motivoContratacao);
    const legacySetor = str(d.setor);
    const legacyObservacao = str(d.observacao);
    const candidatos = parseObjectArray(d, 'candidatos').map((row) => ({
      nome: str(row.nome),
      funcao: str(row.funcao),
      contato: str(row.contato),
      motivoContratacao: str(row.motivoContratacao) || legacyMotivo,
      setor: str(row.setor) || legacySetor,
      observacao: str(row.observacao) || legacyObservacao,
      anexoDocumento: row.anexoDocumento,
    }));
    return {
      sectionTitle: 'Detalhes da admissão',
      items: candidatos.map((c, i) => {
        const motivo = c.motivoContratacao
          ? MOTIVO_CONTRATACAO_LABELS[c.motivoContratacao] ?? c.motivoContratacao
          : '—';
        const parts = [
          dash(c.funcao) + (c.contato ? ` (${c.contato})` : ''),
          `Motivo: ${motivo}`,
          `Setor: ${dash(c.setor)}`,
          c.observacao ? `Obs.: ${c.observacao}` : '',
          attachmentName(c.anexoDocumento)
            ? `Anexo: ${attachmentName(c.anexoDocumento)}`
            : '',
        ].filter(Boolean);
        return {
          title: c.nome || `Pessoa ${i + 1}`,
          subtitle: parts.join('\n'),
        };
      }),
    };
  }

  if (requestType === 'FERIAS') {
    const ferias =
      parseObjectArray(d, 'ferias').length > 0
        ? parseObjectArray(d, 'ferias')
        : legacyEmployeeRows(d, {
            dataInicial: d.dataInicial,
            dataFinal: d.dataFinal,
            observacao: d.observacao,
          });
    return {
      sectionTitle: 'Detalhes das férias',
      items: listItems(ferias, nameById, (row) => {
        const periodo = `${formatYmd(row.dataInicial)} à ${formatYmd(row.dataFinal)}`;
        const obs = str(row.observacao);
        return obs ? `${periodo} — ${obs}` : periodo;
      }),
    };
  }

  if (requestType === 'RESCISAO') {
    const rescisoes =
      parseObjectArray(d, 'rescisoes').length > 0
        ? parseObjectArray(d, 'rescisoes')
        : legacyEmployeeRows(d, {
            tipoAviso: d.tipoAviso,
            tipoRescisao: d.tipoRescisao,
            motivo: d.motivo,
            observacoes: d.observacoes,
          });
    return {
      sectionTitle: 'Detalhes da rescisão',
      items: listItems(rescisoes, nameById, (row) => {
        const parts = [str(row.tipoAviso), str(row.tipoRescisao), str(row.motivo)].filter(
          Boolean,
        );
        const obs = str(row.observacoes);
        const doc = attachmentName(row.anexoDocumento);
        let text = parts.join(' — ') || '—';
        if (obs) text += ` — ${obs}`;
        if (doc) text += ` — Anexo: ${doc}`;
        return text;
      }),
    };
  }

  if (requestType === 'ALTERACAO_FUNCAO_SALARIO') {
    const alteracoes =
      parseObjectArray(d, 'alteracoes').length > 0
        ? parseObjectArray(d, 'alteracoes')
        : legacyEmployeeRows(d, {
            funcaoSalarioAntigo: d.funcaoSalarioAntigo,
            funcaoSalarioNovo: d.funcaoSalarioNovo,
            justificativa: d.justificativa,
          });
    return {
      sectionTitle: 'Detalhes da alteração',
      items: listItems(alteracoes, nameById, (row) => {
        const oldV = str(row.funcaoSalarioAntigo);
        const newV = str(row.funcaoSalarioNovo);
        const just = str(row.justificativa);
        return `${oldV || '—'} → ${newV || '—'}${just ? ` — ${just}` : ''}`;
      }),
    };
  }

  if (requestType === 'ADVERTENCIA_SUSPENSAO') {
    const medidas =
      parseObjectArray(d, 'medidas').length > 0
        ? parseObjectArray(d, 'medidas')
        : legacyEmployeeRows(d, { punicao: d.punicao, motivo: d.motivo });
    return {
      sectionTitle: 'Detalhes da medida disciplinar',
      items: listItems(medidas, nameById, (row) => {
        const motivo = str(row.motivo);
        return `${punicaoLabel(str(row.punicao))}${motivo ? ` — ${motivo}` : ''}`;
      }),
    };
  }

  if (requestType === 'ATESTADO_MEDICO') {
    const atestados =
      parseObjectArray(d, 'atestados').length > 0
        ? parseObjectArray(d, 'atestados')
        : legacyEmployeeRows(d, {
            dataInicial: d.dataInicial,
            dataFinal: d.dataFinal,
            numeroDias: d.numeroDias,
          });
    return {
      sectionTitle: 'Detalhes do atestado',
      items: listItems(
        atestados,
        nameById,
        (row) =>
          `${formatYmd(row.dataInicial)} à ${formatYmd(row.dataFinal)} — ${dash(str(row.numeroDias))} dia(s)`,
      ),
    };
  }

  if (requestType === 'RETIFICACAO_ALOCACAO') {
    const retificacoes =
      parseObjectArray(d, 'retificacoes').length > 0
        ? parseObjectArray(d, 'retificacoes')
        : legacyEmployeeRows(d, { data: d.data, justificativa: d.justificativa });
    return {
      sectionTitle: 'Detalhes da retificação',
      items: listItems(
        retificacoes,
        nameById,
        (row) => `${formatYmd(row.data)} — ${dash(str(row.justificativa))}`,
      ),
    };
  }

  if (requestType === 'HORA_EXTRA') {
    const horasExtras =
      parseObjectArray(d, 'horasExtras').length > 0
        ? parseObjectArray(d, 'horasExtras')
        : legacyEmployeeRows(d, { datas: d.datas, justificativa: d.justificativa });
    return {
      sectionTitle: 'Detalhes de hora extra',
      items: listItems(horasExtras, nameById, (row) => {
        const rawDatas = str(row.datas);
        const parts = rawDatas.split(' - ').map((s) => s.trim());
        const periodo =
          parts.length >= 2
            ? `${formatDateTimeLocal(parts[0])} à ${formatDateTimeLocal(parts[1])}`
            : rawDatas
              ? formatDateTimeLocal(rawDatas)
              : '—';
        const just = str(row.justificativa);
        return just ? `${periodo} — ${just}` : periodo;
      }),
    };
  }

  if (requestType === 'BENEFICIOS_VIAGEM') {
    const viagens =
      parseObjectArray(d, 'viagensBeneficio').length > 0
        ? parseObjectArray(d, 'viagensBeneficio')
        : legacyEmployeeRows(d, {
            dataInicial: d.dataInicial,
            dataFinal: d.dataFinal,
            numeroDias: d.numeroDias,
            diasHotel: d.diasHotel,
            motivoViagem: d.motivoViagem,
          });
    return {
      sectionTitle: 'Detalhes da viagem',
      items: listItems(viagens, nameById, (row) => {
        const hotel = str(row.diasHotel);
        const base = `${formatYmd(row.dataInicial)} à ${formatYmd(row.dataFinal)} — ${dash(str(row.numeroDias))} dia(s)`;
        return [base, hotel ? `Hotel: ${hotel}` : '', str(row.motivoViagem)]
          .filter(Boolean)
          .join(' — ');
      }),
    };
  }

  if (requestType === 'OUTRAS_SOLICITACOES') {
    const itens =
      parseObjectArray(d, 'itens').length > 0
        ? parseObjectArray(d, 'itens')
        : legacyEmployeeRows(d, {
            tipoSolicitacao: d.tipoSolicitacao,
            situacao: d.situacao,
            justificativa: d.justificativa,
          });
    return {
      sectionTitle: 'Detalhes da solicitação',
      items: listItems(itens, nameById, (row) => {
        const parts = [
          str(row.tipoSolicitacao),
          str(row.situacao),
          str(row.justificativa),
          str(row.observacoes),
        ].filter(Boolean);
        return parts.join(' — ') || '—';
      }),
    };
  }

  if (requestType === 'ADM_ASOS') {
    const asos =
      parseObjectArray(d, 'asos').length > 0
        ? parseObjectArray(d, 'asos')
        : d.asoTipo || d.employeeId
          ? [d]
          : [];
    return {
      sectionTitle: "Detalhes do ASO",
      items: listItems(asos, nameById, (row) => {
        const asoTipoLabel =
          ASO_TIPO_LABELS[String(row.asoTipo ?? '')] ?? str(row.asoTipo);
        const seguirPcmso =
          row.seguirPcmso === 'SIM'
            ? 'PCMSO: Sim'
            : row.seguirPcmso === 'NAO'
              ? 'PCMSO: Não'
              : '';
        return [
          dash(asoTipoLabel),
          str(row.cpf) ? `CPF ${str(row.cpf)}` : '',
          str(row.setor),
          str(row.cargo),
          row.asoTipo === 'ALTERACAO_FUNCAO' && str(row.novoCargo)
            ? `Novo cargo: ${str(row.novoCargo)}`
            : '',
          str(row.centroCusto),
          str(row.localTrabalho),
          str(row.empresa),
          seguirPcmso,
        ]
          .filter(Boolean)
          .join(' — ');
      }),
    };
  }

  if (requestType === 'ADM_VIAGENS') {
    const viagens =
      parseObjectArray(d, 'viagens').length > 0
        ? parseObjectArray(d, 'viagens')
        : legacyEmployeeRows(d, {
            dataIda: d.dataIda,
            dataVolta: d.dataVolta,
            cidade: d.cidade,
            motivoViagem: d.motivoViagem,
            numeroDias: d.numeroDias,
            pedagio: d.pedagio,
            observacoes: d.observacoes,
          });
    return {
      sectionTitle: 'Detalhes da viagem',
      items: listItems(viagens, nameById, (row) => {
        const pedagio =
          row.pedagio === 'SIM' ? 'Pedágio: Sim' : row.pedagio === 'NAO' ? 'Pedágio: Não' : '';
        return [
          `${formatYmd(row.dataIda)} à ${formatYmd(row.dataVolta)}`,
          str(row.cidade),
          str(row.motivoViagem),
          str(row.numeroDias) ? `${str(row.numeroDias)} dia(s)` : '',
          pedagio,
          str(row.observacoes),
        ]
          .filter(Boolean)
          .join(' — ');
      }),
    };
  }

  if (requestType.startsWith('ADM_')) {
    const itens =
      parseObjectArray(d, 'itens').length > 0
        ? parseObjectArray(d, 'itens')
        : 'detalhes' in d
          ? legacyEmployeeRows(d, { detalhes: d.detalhes })
          : [];
    if (!itens.length) return null;
    return {
      sectionTitle: 'Detalhes da solicitação',
      items: listItems(itens, nameById, (row) => dash(str(row.detalhes))),
    };
  }

  return null;
}
