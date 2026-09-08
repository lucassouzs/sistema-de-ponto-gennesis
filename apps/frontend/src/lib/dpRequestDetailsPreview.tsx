/* eslint-disable react/no-array-index-key */
'use client';

import React from 'react';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { ASO_TIPO_LABELS } from '@/app/ponto/solicitacoes-dp/dpSolicitacaoRepeatableFields';

function formatYmdToBr(ymd: unknown): string {
  if (typeof ymd !== 'string') return '—';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}

function formatDateTimeLocalToBr(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '—';
  return formatDateTimeBr(value, '—');
}

function toTrimmedString(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function renderValueOrDash(value: string | null | undefined) {
  return value && value.trim() ? value : '—';
}

function dpAttachmentFileName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  return String((raw as Record<string, unknown>).fileName ?? '').trim();
}

function parseRangeRaw(raw: string): [string, string] {
  const parts = raw.split(' - ').map((s) => s.trim());
  if (parts.length >= 2) return [parts[0] ?? '', parts[1] ?? ''];
  return [parts[0] ?? '', ''];
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

function parseObjectArray(d: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const raw = d[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function employeeName(
  row: Record<string, unknown>,
  employeeNameById?: Map<string, string>
): string {
  const id = toTrimmedString(row.employeeId);
  if (!id) return '—';
  return employeeNameById?.get(id) ?? id;
}

function punicaoLabel(punicao: string) {
  return punicao === 'ADVERTENCIA' ? 'Advertência' : punicao === 'SUSPENSAO' ? 'Suspensão' : punicao || '—';
}

type PreviewListProps = {
  items: Record<string, unknown>[];
  employeeNameById?: Map<string, string>;
  personItemCls: string;
  formatSubtitle: (row: Record<string, unknown>) => string;
};

function PreviewItemList({ items, employeeNameById, personItemCls, formatSubtitle }: PreviewListProps) {
  if (!items.length) return <div className="text-sm text-gray-700 dark:text-gray-300">—</div>;
  return (
    <ul className="space-y-3">
      {items.map((row, index) => (
        <li key={index} className={personItemCls}>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {employeeName(row, employeeNameById)}
          </div>
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{formatSubtitle(row)}</div>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  requestType: string;
  details?: Record<string, unknown> | null;
  employeeNameById?: Map<string, string>;
};

export function DpRequestDetailsPreview({ requestType, details, employeeNameById }: Props) {
  const d = details ?? null;
  if (!d) return null;

  const sectionBaseCls =
    'rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-4 text-sm';
  const titleCls = 'text-sm font-semibold text-gray-900 dark:text-gray-100';
  const keyValueCls = 'text-sm text-gray-700 dark:text-gray-300';
  const keyCls = 'font-semibold text-gray-900 dark:text-gray-100';
  const metaItemCls = 'space-y-0.5';
  const metaLabelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const metaValueCls = 'text-sm text-gray-900 dark:text-gray-100';
  const personItemCls = 'border-l-2 border-gray-200 pl-3 py-1 dark:border-gray-600';

  const MOTIVO_CONTRATACAO_LABELS: Record<string, string> = {
    AUMENTO_QUADRO: 'Aumento de quadro',
    SUBSTITUICAO: 'Substituição',
    DEMANDA_TEMPORARIA: 'Demanda temporária / obra',
    OUTRO: 'Outro',
  };

  const legacyEmployeeRows = (shared: Record<string, unknown>) =>
    extractEmployeeIds(d).map((employeeId) => ({ employeeId, ...shared }));

  if (requestType === 'ADMISSAO') {
    const legacyMotivo = toTrimmedString(d.motivoContratacao);
    const legacySetor = toTrimmedString(d.setor);
    const legacyObservacao = toTrimmedString(d.observacao);
    const candidatos = parseObjectArray(d, 'candidatos').map((row) => ({
      nome: toTrimmedString(row.nome),
      funcao: toTrimmedString(row.funcao),
      contato: toTrimmedString(row.contato),
      motivoContratacao: toTrimmedString(row.motivoContratacao) || legacyMotivo,
      setor: toTrimmedString(row.setor) || legacySetor,
      observacao: toTrimmedString(row.observacao) || legacyObservacao,
      anexoDocumento: row.anexoDocumento,
    }));
    const shown = candidatos.slice(0, 6);
    const remaining = candidatos.length - shown.length;

    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da admissão</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={metaItemCls}>
            <div className={metaLabelCls}>Quantidade</div>
            <div className={metaValueCls}>{candidatos.length || '—'}</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pessoas</div>
            {remaining > 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">+ {remaining} outros</div>
            ) : null}
          </div>
          {candidatos.length ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map((c, idx) => (
                <li key={idx} className={personItemCls}>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {renderValueOrDash(c.nome)}
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {renderValueOrDash(c.funcao)}
                    {c.contato ? ` (${c.contato})` : ''}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Motivo:{' '}
                    {c.motivoContratacao
                      ? MOTIVO_CONTRATACAO_LABELS[c.motivoContratacao] ?? c.motivoContratacao
                      : '—'}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Setor: {renderValueOrDash(c.setor)}
                  </div>
                  {c.observacao ? (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
                      Obs.: {c.observacao}
                    </div>
                  ) : null}
                  {dpAttachmentFileName(c.anexoDocumento) ? (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Anexo: {dpAttachmentFileName(c.anexoDocumento)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className={keyValueCls}>—</div>
          )}
        </div>
      </div>
    );
  }

  if (requestType === 'FERIAS') {
    const ferias =
      parseObjectArray(d, 'ferias').length > 0
        ? parseObjectArray(d, 'ferias')
        : legacyEmployeeRows({
            dataInicial: d.dataInicial,
            dataFinal: d.dataFinal,
            observacao: d.observacao,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes das férias</h3>
        <PreviewItemList
          items={ferias}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const periodo = `${formatYmdToBr(row.dataInicial)} à ${formatYmdToBr(row.dataFinal)}`;
            const obs = toTrimmedString(row.observacao);
            return obs ? `${periodo} — ${obs}` : periodo;
          }}
        />
      </div>
    );
  }

  if (requestType === 'RESCISAO') {
    const rescisoes =
      parseObjectArray(d, 'rescisoes').length > 0
        ? parseObjectArray(d, 'rescisoes')
        : legacyEmployeeRows({
            tipoAviso: d.tipoAviso,
            tipoRescisao: d.tipoRescisao,
            motivo: d.motivo,
            observacoes: d.observacoes,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da rescisão</h3>
        <PreviewItemList
          items={rescisoes}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const parts = [
              toTrimmedString(row.tipoAviso),
              toTrimmedString(row.tipoRescisao),
              toTrimmedString(row.motivo),
            ].filter(Boolean);
            const obs = toTrimmedString(row.observacoes);
            const doc = dpAttachmentFileName(row.anexoDocumento);
            let text = obs ? `${parts.join(' — ')} — ${obs}` : parts.join(' — ') || '—';
            if (doc) text = `${text} — Anexo: ${doc}`;
            return text;
          }}
        />
      </div>
    );
  }

  if (requestType === 'ALTERACAO_FUNCAO_SALARIO') {
    const alteracoes =
      parseObjectArray(d, 'alteracoes').length > 0
        ? parseObjectArray(d, 'alteracoes')
        : legacyEmployeeRows({
            funcaoSalarioAntigo: d.funcaoSalarioAntigo,
            funcaoSalarioNovo: d.funcaoSalarioNovo,
            justificativa: d.justificativa,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da alteração de função/salário</h3>
        <PreviewItemList
          items={alteracoes}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const oldV = toTrimmedString(row.funcaoSalarioAntigo);
            const newV = toTrimmedString(row.funcaoSalarioNovo);
            const just = toTrimmedString(row.justificativa);
            return `${oldV || '—'} → ${newV || '—'}${just ? ` — ${just}` : ''}`;
          }}
        />
      </div>
    );
  }

  if (requestType === 'ADVERTENCIA_SUSPENSAO') {
    const medidas =
      parseObjectArray(d, 'medidas').length > 0
        ? parseObjectArray(d, 'medidas')
        : legacyEmployeeRows({ punicao: d.punicao, motivo: d.motivo });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da medida disciplinar</h3>
        <PreviewItemList
          items={medidas}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const motivo = toTrimmedString(row.motivo);
            return `${punicaoLabel(toTrimmedString(row.punicao))}${motivo ? ` — ${motivo}` : ''}`;
          }}
        />
      </div>
    );
  }

  if (requestType === 'ATESTADO_MEDICO') {
    const atestados =
      parseObjectArray(d, 'atestados').length > 0
        ? parseObjectArray(d, 'atestados')
        : legacyEmployeeRows({
            dataInicial: d.dataInicial,
            dataFinal: d.dataFinal,
            numeroDias: d.numeroDias,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes do atestado</h3>
        <PreviewItemList
          items={atestados}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) =>
            `${formatYmdToBr(row.dataInicial)} à ${formatYmdToBr(row.dataFinal)} — ${renderValueOrDash(toTrimmedString(row.numeroDias))} dia(s)`
          }
        />
      </div>
    );
  }

  if (requestType === 'RETIFICACAO_ALOCACAO') {
    const retificacoes =
      parseObjectArray(d, 'retificacoes').length > 0
        ? parseObjectArray(d, 'retificacoes')
        : legacyEmployeeRows({ data: d.data, justificativa: d.justificativa });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da retificação</h3>
        <PreviewItemList
          items={retificacoes}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) =>
            `${formatYmdToBr(row.data)} — ${renderValueOrDash(toTrimmedString(row.justificativa))}`
          }
        />
      </div>
    );
  }

  if (requestType === 'HORA_EXTRA') {
    const horasExtras =
      parseObjectArray(d, 'horasExtras').length > 0
        ? parseObjectArray(d, 'horasExtras')
        : legacyEmployeeRows({ datas: d.datas, justificativa: d.justificativa });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes de hora extra</h3>
        <PreviewItemList
          items={horasExtras}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const rawDatas = toTrimmedString(row.datas);
            const [inicioRaw, fimRaw] = rawDatas ? parseRangeRaw(rawDatas) : ['', ''];
            const periodo =
              inicioRaw && fimRaw
                ? `${formatDateTimeLocalToBr(inicioRaw)} à ${formatDateTimeLocalToBr(fimRaw)}`
                : rawDatas
                  ? formatDateTimeLocalToBr(rawDatas)
                  : '—';
            const just = toTrimmedString(row.justificativa);
            return just ? `${periodo} — ${just}` : periodo;
          }}
        />
      </div>
    );
  }

  if (requestType === 'BENEFICIOS_VIAGEM') {
    const viagens =
      parseObjectArray(d, 'viagensBeneficio').length > 0
        ? parseObjectArray(d, 'viagensBeneficio')
        : legacyEmployeeRows({
            dataInicial: d.dataInicial,
            dataFinal: d.dataFinal,
            numeroDias: d.numeroDias,
            diasHotel: d.diasHotel,
            motivoViagem: d.motivoViagem,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da viagem</h3>
        <PreviewItemList
          items={viagens}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const hotel = toTrimmedString(row.diasHotel);
            const base = `${formatYmdToBr(row.dataInicial)} à ${formatYmdToBr(row.dataFinal)} — ${renderValueOrDash(toTrimmedString(row.numeroDias))} dia(s)`;
            const motivo = toTrimmedString(row.motivoViagem);
            const parts = [base, hotel ? `Hotel: ${hotel}` : '', motivo].filter(Boolean);
            return parts.join(' — ');
          }}
        />
      </div>
    );
  }

  if (requestType === 'OUTRAS_SOLICITACOES') {
    const itens =
      parseObjectArray(d, 'itens').length > 0
        ? parseObjectArray(d, 'itens')
        : legacyEmployeeRows({
            tipoSolicitacao: d.tipoSolicitacao,
            situacao: d.situacao,
            justificativa: d.justificativa,
            datas: d.datas,
            valores: d.valores,
            observacoes: d.observacoes,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da solicitação</h3>
        <PreviewItemList
          items={itens}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const parts = [
              toTrimmedString(row.tipoSolicitacao),
              toTrimmedString(row.situacao),
              toTrimmedString(row.justificativa),
            ].filter(Boolean);
            return parts.join(' — ') || '—';
          }}
        />
      </div>
    );
  }

  if (requestType === 'ADM_ASOS') {
    const asos =
      parseObjectArray(d, 'asos').length > 0
        ? parseObjectArray(d, 'asos')
        : d.asoTipo || d.employeeId
          ? [d]
          : [];
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes do ASO (ADM/TST)</h3>
        <PreviewItemList
          items={asos}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const asoTipoLabel =
              ASO_TIPO_LABELS[String(row.asoTipo ?? '')] ?? toTrimmedString(row.asoTipo);
            const seguirPcmso =
              row.seguirPcmso === 'SIM' ? 'PCMSO: Sim' : row.seguirPcmso === 'NAO' ? 'PCMSO: Não' : '';
            const parts = [
              renderValueOrDash(asoTipoLabel),
              toTrimmedString(row.cpf) ? `CPF ${toTrimmedString(row.cpf)}` : '',
              toTrimmedString(row.setor),
              toTrimmedString(row.cargo),
              row.asoTipo === 'ALTERACAO_FUNCAO' && toTrimmedString(row.novoCargo)
                ? `Novo cargo: ${toTrimmedString(row.novoCargo)}`
                : '',
              toTrimmedString(row.centroCusto),
              toTrimmedString(row.localTrabalho),
              toTrimmedString(row.empresa),
              seguirPcmso,
            ].filter(Boolean);
            return parts.join(' — ') || '—';
          }}
        />
      </div>
    );
  }

  if (requestType === 'ADM_VIAGENS') {
    const viagens =
      parseObjectArray(d, 'viagens').length > 0
        ? parseObjectArray(d, 'viagens')
        : legacyEmployeeRows({
            dataIda: d.dataIda,
            dataVolta: d.dataVolta,
            cidade: d.cidade,
            motivoViagem: d.motivoViagem,
            numeroDias: d.numeroDias,
            pedagio: d.pedagio,
            observacoes: d.observacoes,
          });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da viagem (ADM/TST)</h3>
        <PreviewItemList
          items={viagens}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => {
            const pedagio =
              row.pedagio === 'SIM' ? 'Pedágio: Sim' : row.pedagio === 'NAO' ? 'Pedágio: Não' : '';
            const parts = [
              `${formatYmdToBr(row.dataIda)} à ${formatYmdToBr(row.dataVolta)}`,
              toTrimmedString(row.cidade),
              toTrimmedString(row.motivoViagem),
              toTrimmedString(row.numeroDias) ? `${toTrimmedString(row.numeroDias)} dia(s)` : '',
              pedagio,
              toTrimmedString(row.observacoes),
            ].filter(Boolean);
            return parts.join(' — ') || '—';
          }}
        />
      </div>
    );
  }

  if (
    requestType.startsWith('ADM_') &&
    requestType !== 'ADM_ASOS' &&
    ('detalhes' in d || parseObjectArray(d, 'itens').length > 0)
  ) {
    const itens =
      parseObjectArray(d, 'itens').length > 0
        ? parseObjectArray(d, 'itens')
        : legacyEmployeeRows({ detalhes: d.detalhes });
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da solicitação (ADM/TST)</h3>
        <PreviewItemList
          items={itens}
          employeeNameById={employeeNameById}
          personItemCls={personItemCls}
          formatSubtitle={(row) => renderValueOrDash(toTrimmedString(row.detalhes))}
        />
      </div>
    );
  }

  return (
    <div className={sectionBaseCls}>
      <h3 className={titleCls}>Detalhes da solicitação</h3>
      <div className={keyValueCls}>—</div>
    </div>
  );
}
