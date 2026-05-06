'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, Plus, Trash2 } from 'lucide-react';
import {
  ROTULO_COLUNA_MEDICAO_OPCOES,
  type DimensoesItem,
  type LinhaMedicao,
  type TipoUnidadeFormula
} from './orcamentoMedicaoTypes';
import { calcA, calcV, calcularQuantidadeLinha } from './orcamentoMedicaoCalc';
import {
  gradeTableCls,
  gradeTableRowTrCls,
  inputGradeBloqueadoCls,
  inputGradeCls,
  selectGradeHeaderMemorialCls
} from './orcamentoGradeCellClasses';

/** Painel de medições (C, L, H, N, %, A, V) — aba Memorial de cálculo (layout em tabela, padrão das demais abas). */
type Props = {
  rowKey: string;
  tipoUnidade: TipoUnidadeFormula;
  /** Número do item na ordem do orçamento (ex.: 1.2.3), como na planilha analítica. */
  itemRotulo: string;
  itemDescricao: string;
  /** Unidade da composição (cadastro) ou derivada do tipo de medição. */
  unidadeMedida: string;
  /** Quantidade efetiva no orçamento (UN) — inclui regras como caçamba 4 m³ derivada da carga. */
  quantidadeUn?: number;
  /** Caçamba 4 m³: quantidade vem da carga de entulho; não editar aqui. */
  quantidadeUnReadOnly?: boolean;
  onQuantidadeUnChange?: (n: number) => void;
  dim: DimensoesItem;
  ehCargaEntulho: boolean;
  draftCalc: Record<string, string>;
  setDraftCalc: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleCalcChange: (draftKey: string, raw: string, onCommit: (n: number) => void) => void;
  handleCalcBlur: (draftKey: string, raw: string, onCommit: (n: number) => void) => void;
  updateLinhaMedicao: (itemKey: string, idx: number, campo: keyof LinhaMedicao, valor: number | string) => void;
  updateRotuloColunaMedicao?: (
    campo: 'descricao' | 'C' | 'L' | 'H' | 'N' | 'pct',
    rotulo: string
  ) => void;
  addLinhaMedicao: (itemKey: string, inserirAposIdx?: number) => void;
  addLinhaCabecalhoSecaoMedicao: (itemKey: string, inserirAposIdx?: number) => void;
  removeLinhaMedicao: (itemKey: string, idx: number) => void;
};

/**
 * Larguras da grade: a1ª linha do thead é um único th com colSpan cheio, então o navegador
 * ignora w-* nas células seguintes e iguala as colunas. `<colgroup>` define a grade de fato.
 */
const COLS_MEDIC_PCT = { desc: 44, med: 7 } as const;

const colDesc = 'min-w-[18rem] sm:min-w-[22rem]';
const colMed = 'min-w-[2.75rem] max-w-[4.25rem]';

const rotuloUnPorTipo = (t: TipoUnidadeFormula | undefined) =>
  t === 'm3' ? 'm³' : t === 'm2' ? 'm²' : t === 'm' ? 'm' : 'UN';

const thFirst =
  `px-3 sm:px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/85 border-b border-r border-gray-200 dark:border-gray-600 ${colDesc}`;
const thRest =
  `px-2 sm:px-3 py-2.5 text-center text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/85 border-b border-r border-gray-200 dark:border-gray-600 ${colMed}`;
const tdFirst =
  `px-3 sm:px-3.5 py-2.5 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRest =
  `px-2 sm:px-3 py-2.5 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
/** Corpo da tabela: sem padding no td para o input cobrir a célula inteira (borda de foco = borda da célula). */
const tdFirstBody =
  `p-0 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRestBody =
  `p-0 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalc =
  `px-2 sm:px-3 py-2.5 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalcBody =
  `p-0 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const inputCls = inputGradeCls;
const inputBloqueadoCls = inputGradeBloqueadoCls;
/** Texto editável com a mesma leitura visual do &lt;th&gt; da coluna Descrição (memória). */
const inputThDescricaoCls =
  'box-border min-h-[2.75rem] w-full min-w-0 border-0 rounded-none bg-transparent px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700 shadow-none outline-none ring-0 transition-[background-color,box-shadow] placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-slate-500 sm:px-3.5 focus:z-[1] focus:bg-red-50/90 dark:focus:bg-red-950/35 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60';

export function OrcamentoMedicaoPainel({
  rowKey,
  tipoUnidade,
  itemRotulo,
  itemDescricao,
  unidadeMedida,
  quantidadeUn = 0,
  quantidadeUnReadOnly = false,
  onQuantidadeUnChange,
  dim,
  ehCargaEntulho,
  draftCalc,
  setDraftCalc,
  handleCalcChange,
  handleCalcBlur,
  updateLinhaMedicao,
  updateRotuloColunaMedicao,
  addLinhaMedicao,
  addLinhaCabecalhoSecaoMedicao,
  removeLinhaMedicao
}: Props) {
  const tipo = tipoUnidade;

  const [menuCtxMedicao, setMenuCtxMedicao] = useState<{ left: number; top: number; idx: number } | null>(null);

  useEffect(() => {
    if (!menuCtxMedicao) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuCtxMedicao(null);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      window.addEventListener('click', fechar);
    }, 0);
    function fechar() {
      setMenuCtxMedicao(null);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      window.removeEventListener('click', fechar);
    };
  }, [menuCtxMedicao]);

  const abrirMenuCtxMedicao = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    const mw = 220;
    const mh = 156;
    let left = e.clientX;
    let top = e.clientY;
    left = Math.min(left, window.innerWidth - mw - 8);
    top = Math.min(top, window.innerHeight - mh - 8);
    setMenuCtxMedicao({ left, top, idx });
  };

  /** Descrição + C + L + H + N + % + A + V + Subtotal. */
  const contarColunasGrade = () => 9;

  const temDimensoes = (ln: LinhaMedicao) =>
    (ln.C || 0) !== 0 || (ln.L || 0) !== 0 || (ln.H || 0) !== 0;

  type ModoDim = 'editar' | 'vazio' | 'fixo_um' | 'carga_bloq';

  const modoDimensao = (ln: LinhaMedicao, campo: 'C' | 'L' | 'H' | 'N'): ModoDim => {
    if (ehCargaEntulho) {
      if (ln.linhaAgregadaCarga) {
        if (ln.tipoOrigemMedicao === 'm2' && campo === 'H') return 'editar';
        if (ln.tipoOrigemMedicao === 'm' && (campo === 'L' || campo === 'H')) return 'editar';
        return 'carga_bloq';
      }
      if (campo === 'N') return 'carga_bloq';
      if (campo === 'C') return ln.editavelC ? 'editar' : 'carga_bloq';
      if (campo === 'L') return ln.editavelL ? 'editar' : 'carga_bloq';
      if (campo === 'H') return ln.editavelH ? 'editar' : 'carga_bloq';
      return 'vazio';
    }
    switch (tipo) {
      case 'm3':
        return 'editar';
      case 'm2':
        if (campo === 'H') return 'vazio';
        return campo === 'C' || campo === 'L' || campo === 'N' ? 'editar' : 'vazio';
      case 'm':
        return campo === 'C' || campo === 'N' ? 'editar' : 'vazio';
      case 'un':
        return campo === 'N' ? 'fixo_um' : 'vazio';
      default:
        return 'vazio';
    }
  };

  type ModoAV = 'vazio' | 'calc' | 'input' | 'carga_calc' | 'carga_inp';

  const modoColunaA = (ln: LinhaMedicao): ModoAV => {
    if (ehCargaEntulho && ln.linhaAgregadaCarga && ln.tipoOrigemMedicao === 'm2') return 'carga_calc';
    if (ehCargaEntulho && ln.linhaAgregadaCarga) return 'vazio';
    const tem = temDimensoes(ln);
    if (ehCargaEntulho) return tem ? 'carga_calc' : 'carga_inp';
    if (tipo === 'm2') return 'calc';
    if (tipo === 'm3' || tipo === 'm') return 'vazio';
    if (tipo === 'un') return !tem ? 'input' : 'vazio';
    return 'vazio';
  };

  const modoColunaV = (ln: LinhaMedicao): ModoAV => {
    if (ehCargaEntulho && ln.linhaAgregadaCarga) return 'carga_calc';
    const tem = temDimensoes(ln);
    if (ehCargaEntulho) return tem ? 'carga_calc' : 'carga_inp';
    if (tipo === 'm3') return tem ? 'calc' : 'input';
    if (tipo === 'm2' || tipo === 'm' || tipo === 'un') return 'vazio';
    return 'vazio';
  };

  const celulaVazia = (title?: string) => (
    <td className={`${tdRest} text-center`} title={title}>
      <span className="text-sm text-gray-300 dark:text-gray-600 select-none" aria-hidden>
        —
      </span>
    </td>
  );

  const lnFallback: LinhaMedicao = { C: 0, L: 0, H: 0, N: 0, empolamento: 0 };

  const renderCabecalhoServico = (colCount: number) => (
    <tr className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls}`}>
      <th
        colSpan={colCount}
        className="border-b border-red-700/70 bg-red-600 px-3 py-2.5 text-left align-middle font-normal dark:border-red-900 dark:bg-red-950/90 sm:px-3.5"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-x-3">
          <p className="min-w-0 flex-1 text-left text-sm font-bold leading-snug text-white">
            <span
              className="mr-2 inline font-bold tabular-nums text-white"
              aria-label={`Item ${itemRotulo || '—'}`}
            >
              {itemRotulo || '—'}
            </span>
            <span className="text-white">{itemDescricao}</span>
          </p>
          <div
            className={`flex shrink-0 items-center justify-center self-start border-t border-white/25 pt-2 text-center sm:self-center sm:border-t-0 sm:border-l sm:border-white/25 sm:pt-0 sm:pl-3 ${colMed}`}
            title="Unidade de medida"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-white">
              {unidadeMedida.trim() || '—'}
            </span>
          </div>
        </div>
      </th>
    </tr>
  );

  type ColCabecalho = 'C' | 'L' | 'H' | 'N' | 'pct';

  const renderRotuloSelect = (
    col: ColCabecalho,
    titleCell: string | undefined,
    as: 'th' | 'td'
  ) => {
    const padraoPorCampo: Record<ColCabecalho, string> = {
      C: 'C',
      L: 'L',
      H: 'H',
      N: 'N',
      pct: '%'
    };
    const salvo = col === 'pct' ? dim.rotulosColunas?.pct : dim.rotulosColunas?.[col];
    const normalizarLegado = (v: string | undefined) => {
      if (v === undefined) return undefined;
      if (v === '') return col === 'pct' ? '%' : 'N';
      return v;
    };
    const salvoNorm = normalizarLegado(salvo);
    const valorAtual = salvoNorm === undefined ? padraoPorCampo[col] : salvoNorm;
    const opcoes = [...ROTULO_COLUNA_MEDICAO_OPCOES] as string[];
    const lista = Array.from(
      new Set(valorAtual !== '' && !opcoes.includes(valorAtual) ? [valorAtual, ...opcoes] : opcoes)
    );
    const ariaDim =
      col === 'C'
        ? 'comprimento'
        : col === 'L'
          ? 'largura'
          : col === 'H'
            ? 'altura'
            : col === 'N'
              ? 'fator N'
              : 'empolamento ou fator %';
    const Tag = as;
    return (
      <Tag className={`${thRest} !p-0 align-middle`} title={titleCell}>
        <label className="flex min-h-[2.75rem] items-stretch justify-center">
          <span className="sr-only">
            Coluna {col === 'pct' ? '%' : col}, rótulo {valorAtual}
          </span>
          <select
            className={selectGradeHeaderMemorialCls}
            value={valorAtual}
            disabled={!updateRotuloColunaMedicao}
            onChange={e => updateRotuloColunaMedicao?.(col, e.target.value)}
            aria-label={`Lista suspensa: rótulo da coluna de ${ariaDim}`}
          >
            {lista.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      </Tag>
    );
  };

  /** Uma linha de cabeçalho das colunas de medição (dentro de &lt;thead&gt;). */
  const renderHeaderRow = (ln0: LinhaMedicao) => {
    const podeEditarC0 = ehCargaEntulho && !!ln0.editavelC;
    const podeEditarL0 = ehCargaEntulho && !!ln0.editavelL;
    const podeEditarH0 = ehCargaEntulho && !!ln0.editavelH;
    const bloquearN0 = ehCargaEntulho;

    return (
      <tr className={gradeTableRowTrCls}>
        <th className={`${thFirst} !p-0 align-middle`}>
          <input
            type="text"
            value={dim.rotulosColunas?.descricao ?? 'DESCRIÇÃO: '}
            onChange={e => updateRotuloColunaMedicao?.('descricao', e.target.value)}
            disabled={!updateRotuloColunaMedicao}
            className={inputThDescricaoCls}
            aria-label="Rótulo da coluna Descrição"
          />
        </th>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'th'
        )}
        <th className={thRest}>A</th>
        <th className={thRest}>V</th>
        <th className={thRest}>Subtotal</th>
      </tr>
    );
  };

  const renderLinhaCabecalhoSecao = (ln: LinhaMedicao, idx: number, ln0Ref: LinhaMedicao) => {
    const podeEditarC0 = ehCargaEntulho && !!ln0Ref.editavelC;
    const podeEditarL0 = ehCargaEntulho && !!ln0Ref.editavelL;
    const podeEditarH0 = ehCargaEntulho && !!ln0Ref.editavelH;
    const bloquearN0 = ehCargaEntulho;
    return (
      <tr
        key={idx}
        className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}
        onContextMenu={
          ehCargaEntulho
            ? undefined
            : e => {
                abrirMenuCtxMedicao(e, idx);
              }
        }
      >
        <td className={`${thFirst} !p-0 align-middle`}>
          <input
            type="text"
            value={ln.descricao ?? 'DESCRIÇÃO: '}
            onChange={e => updateLinhaMedicao(rowKey, idx, 'descricao', e.target.value)}
            className={inputThDescricaoCls}
            aria-label="Descrição da linha de cabeçalho de seção"
          />
        </td>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'td'
        )}
        <td className={thRest}>A</td>
        <td className={thRest}>V</td>
        <td className={thRest}>Subtotal</td>
      </tr>
    );
  };

  const renderRow = (ln: LinhaMedicao, idx: number) => {
    const ln0Ref = dim.linhas.find(l => !l.cabecalhoSecao) ?? dim.linhas[0];
    if (ln.cabecalhoSecao) {
      return renderLinhaCabecalhoSecao(ln, idx, ln0Ref);
    }
    const valorA = calcA(ln);
    const valorV = calcV(ln, tipo);
    const valorSubtotal = calcularQuantidadeLinha(ln, tipo);
    const empolVal =
      ln.empolamento ??
      ((ln as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100
        : 0);
    const podeEditarCNaCarga = ehCargaEntulho && !!ln.editavelC;
    const podeEditarLNaCarga = ehCargaEntulho && !!ln.editavelL;
    const podeEditarHNaCarga = ehCargaEntulho && !!ln.editavelH;
    const bloquearDescricao = ehCargaEntulho;
    const bloquearN = ehCargaEntulho;

    const renderDim = (campo: 'C' | 'L' | 'H' | 'N') => {
      const modo = modoDimensao(ln, campo);
      if (modo === 'vazio') {
        return celulaVazia('Não aplicável para esta unidade de medida');
      }
      if (modo === 'fixo_um') {
        return (
          <td className={`${tdRestBody} text-center`} title="Quantidade (UN)">
            <input
              readOnly
              tabIndex={-1}
              className={`${inputBloqueadoCls} opacity-80`}
              value={String(ln.N ?? 1)}
            />
          </td>
        );
      }
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const raw =
        campo === 'C'
          ? draftCalc[draftKey] ?? ((ln.C || 0) === 0 ? '' : String(ln.C))
          : campo === 'L'
            ? draftCalc[draftKey] ?? ((ln.L || 0) === 0 ? '' : String(ln.L))
            : campo === 'H'
              ? draftCalc[draftKey] ?? ((ln.H || 0) === 0 ? '' : String(ln.H))
              : draftCalc[draftKey] ?? String(ln.N ?? 1);
      const podeEditar =
        campo === 'C'
          ? !ehCargaEntulho || podeEditarCNaCarga
          : campo === 'L'
            ? !ehCargaEntulho || podeEditarLNaCarga
            : campo === 'H'
              ? !ehCargaEntulho || podeEditarHNaCarga
              : !bloquearN;
      const onCommit = (n: number) => {
        if (campo === 'N') updateLinhaMedicao(rowKey, idx, 'N', Math.max(1, n));
        else updateLinhaMedicao(rowKey, idx, campo, n);
      };
      return (
        <td className={`${tdRestBody} text-center`}>
          <input
            type="text"
            inputMode="decimal"
            placeholder={campo === 'N' ? '1' : '0'}
            value={raw}
            onChange={e => podeEditar && handleCalcChange(draftKey, e.target.value, onCommit)}
            onBlur={e => podeEditar && handleCalcBlur(draftKey, draftCalc[draftKey] ?? e.target.value, onCommit)}
            readOnly={!podeEditar}
            className={!podeEditar ? inputBloqueadoCls : `${inputCls} text-center`}
          />
        </td>
      );
    };

    const mA = modoColunaA(ln);
    const mV = modoColunaV(ln);

    const renderCelulaA = () => {
      if (mA === 'vazio') return celulaVazia('Não aplicável para esta unidade');
      if (mA === 'calc' || mA === 'carga_calc') {
        return (
          <td className={tdCalc} title="Área (m²)">
            {valorA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </td>
        );
      }
      return (
        <td className={tdCalcBody} title="Área (m²) / quantidade manual">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={
              draftCalc[`${rowKey}|${idx}|A`] ??
              (ln.valorManual == null || ln.valorManual === 0 ? '' : String(ln.valorManual))
            }
            onChange={e =>
              !ehCargaEntulho &&
              handleCalcChange(`${rowKey}|${idx}|A`, e.target.value, n => updateLinhaMedicao(rowKey, idx, 'valorManual', n))
            }
            onBlur={e =>
              !ehCargaEntulho &&
              handleCalcBlur(`${rowKey}|${idx}|A`, draftCalc[`${rowKey}|${idx}|A`] ?? e.target.value, n =>
                updateLinhaMedicao(rowKey, idx, 'valorManual', n)
              )
            }
            readOnly={ehCargaEntulho}
            className={ehCargaEntulho ? inputBloqueadoCls : `${inputCls} text-center`}
          />
        </td>
      );
    };

    const renderCelulaV = () => {
      if (mV === 'vazio') return celulaVazia('Não aplicável para esta unidade');
      if (mV === 'calc' || mV === 'carga_calc') {
        return (
          <td className={tdCalc} title="Volume (m³)">
            {valorV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </td>
        );
      }
      return (
        <td className={tdCalcBody} title="Volume (m³) / quantidade manual">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={
              draftCalc[`${rowKey}|${idx}|V`] ??
              (ln.valorManual == null || ln.valorManual === 0 ? '' : String(ln.valorManual))
            }
            onChange={e =>
              !ehCargaEntulho &&
              handleCalcChange(`${rowKey}|${idx}|V`, e.target.value, n => updateLinhaMedicao(rowKey, idx, 'valorManual', n))
            }
            onBlur={e =>
              !ehCargaEntulho &&
              handleCalcBlur(`${rowKey}|${idx}|V`, draftCalc[`${rowKey}|${idx}|V`] ?? e.target.value, n =>
                updateLinhaMedicao(rowKey, idx, 'valorManual', n)
              )
            }
            readOnly={ehCargaEntulho}
            className={ehCargaEntulho ? inputBloqueadoCls : `${inputCls} text-center`}
          />
        </td>
      );
    };

    const unNoFimCarga = ln.linhaAgregadaCarga
      ? rotuloUnPorTipo(ln.tipoOrigemMedicao)
      : rotuloUnPorTipo('m3');
    const rotuloCargaVis = ln.origemComposicaoRotulo?.trim() ?? '';
    const descMeioCarga = ln.descricao?.trim() ?? '';
    const origemKeyNavegacao =
      ln.linhaAgregadaCarga && ln.origemLinhaId ? ln.origemLinhaId.replace(/\|agg$/, '') : null;

    /** Grid esticado + conteúdo centralizado em cada célula (evita descrição “subindo” como no 2.2.2). */
    const rowCargaDescCls = 'grid min-h-[2.75rem] w-full min-w-0 max-w-full items-stretch gap-x-2';
    const rowCargaDescGridStyle: React.CSSProperties = {
      gridTemplateColumns: rotuloCargaVis
        ? 'max-content minmax(0, 1fr) 3.25rem'
        : 'minmax(0, 1fr) 3.25rem'
    };
    /** Sem rolagem: uma linha, texto cortado na borda da coluna. */
    const descCargaMeioCls =
      'block min-w-0 w-full overflow-hidden whitespace-nowrap text-left leading-snug';
    const descCargaMeioWrapCls = 'flex min-h-0 min-w-0 w-full items-center overflow-hidden';
    const rotuloCargaCls = 'flex items-center whitespace-nowrap font-medium tabular-nums leading-snug';
    const unCargaCls = 'flex items-center justify-end font-medium tabular-nums leading-snug';

    return (
      <tr
        key={idx}
        className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}
        onContextMenu={ehCargaEntulho ? undefined : e => abrirMenuCtxMedicao(e, idx)}
      >
        <td
          className={`${tdFirstBody} ${ehCargaEntulho && bloquearDescricao ? 'max-w-0' : ''}`}
        >
          {bloquearDescricao && origemKeyNavegacao ? (
            <button
              type="button"
              title="Ir à memória de cálculo deste item"
              className={`box-border cursor-pointer border-0 bg-transparent px-3 py-2.5 text-sm font-normal text-gray-900 dark:text-gray-100 sm:px-3.5 ${rowCargaDescCls}`}
              style={rowCargaDescGridStyle}
              onClick={() => {
                document
                  .getElementById(`memorial-medicoes-${origemKeyNavegacao}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {rotuloCargaVis ? <span className={rotuloCargaCls}>{rotuloCargaVis}</span> : null}
              <div className={descCargaMeioWrapCls}>
                <span className={descCargaMeioCls}>{descMeioCarga || '—'}</span>
              </div>
              <span className={unCargaCls}>{unNoFimCarga}</span>
            </button>
          ) : bloquearDescricao ? (
            <div
              className={`px-3 py-2.5 text-gray-900 dark:text-gray-100 sm:px-3.5 ${rowCargaDescCls} ${inputBloqueadoCls}`}
              style={rowCargaDescGridStyle}
              aria-readonly
            >
              {rotuloCargaVis ? <span className={rotuloCargaCls}>{rotuloCargaVis}</span> : null}
              <div className={descCargaMeioWrapCls}>
                <span className={descCargaMeioCls}>{descMeioCarga || '—'}</span>
              </div>
              <span className={unCargaCls}>{unNoFimCarga}</span>
            </div>
          ) : (
            <input
              type="text"
              placeholder="Ex: COBERTURA DAS CALDEIRAS"
              value={ln.descricao || ''}
              onChange={e => updateLinhaMedicao(rowKey, idx, 'descricao', e.target.value)}
              className={`${inputCls} text-left`}
            />
          )}
        </td>
        {renderDim('C')}
        {renderDim('L')}
        {renderDim('H')}
        {renderDim('N')}
        <td className={`${tdRestBody} text-center`}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="1"
            value={draftCalc[`${rowKey}|${idx}|empol`] ?? (empolVal === 0 ? '0' : empolVal === 1 ? '1' : String(empolVal))}
            onChange={e =>
              handleCalcChange(`${rowKey}|${idx}|empol`, e.target.value, n =>
                updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n))
              )
            }
            onBlur={e =>
              handleCalcBlur(`${rowKey}|${idx}|empol`, draftCalc[`${rowKey}|${idx}|empol`] ?? e.target.value, n =>
                updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n))
              )
            }
            className={`${inputCls} text-center`}
          />
        </td>
        {renderCelulaA()}
        {renderCelulaV()}
        <td className={tdCalc} title="Quantidade da linha">
          {valorSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </td>
      </tr>
    );
  };

  const portalMenuCtxMedicao =
    menuCtxMedicao &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[200]" aria-hidden onClick={() => setMenuCtxMedicao(null)} />
        <div
          role="menu"
          className="fixed z-[201] min-w-[12rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          style={{ left: menuCtxMedicao.left, top: menuCtxMedicao.top }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
            onClick={() => {
              addLinhaMedicao(rowKey, menuCtxMedicao.idx);
              setMenuCtxMedicao(null);
            }}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Adicionar linha abaixo
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
            onClick={() => {
              addLinhaCabecalhoSecaoMedicao(rowKey, menuCtxMedicao.idx);
              setMenuCtxMedicao(null);
            }}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Adicionar linha de cabeçalho abaixo
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => {
              removeLinhaMedicao(rowKey, menuCtxMedicao.idx);
              setMenuCtxMedicao(null);
            }}
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            Excluir linha
          </button>
        </div>
      </>,
      document.body
    );

  /** Evita borda “dupla” grossa: o contêiner já tem borda; última linha/coluna não repetem border-b/border-r. */
  const gradeTabelaMemorialBordaCls =
    '[&_tbody_tr:last-child_td]:!border-b-0 [&_td:last-child]:!border-r-0 [&_thead_th:last-child]:!border-r-0';

  const tabelaEnvoltorio = (children: React.ReactNode) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <table
        className={`w-full min-w-[56rem] table-fixed border-collapse text-sm ${gradeTableCls} ${gradeTabelaMemorialBordaCls}`}
      >
        <colgroup>
          <col style={{ width: `${COLS_MEDIC_PCT.desc}%` }} />
          {Array.from({ length: 8 }, (_, i) => (
            <col key={i} style={{ width: `${COLS_MEDIC_PCT.med}%` }} />
          ))}
        </colgroup>
        {children}
      </table>
    </div>
  );

  /** Itens em unidade (UN): quantidade na coluna N, alinhado à exportação e à aba Orçamento. */
  if (tipo === 'un' && !ehCargaEntulho) {
    const colUn = contarColunasGrade();
    const draftKeyUn = `${rowKey}|un|qtd`;
    const aplicarQtd = (n: number) => {
      onQuantidadeUnChange?.(Math.max(0, n));
    };
    const fmtUn = quantidadeUn.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4
    });
    return (
      <div className="space-y-3">
        {tabelaEnvoltorio(
          <>
            <thead>
              {renderCabecalhoServico(colUn)}
              {renderHeaderRow(lnFallback)}
            </thead>
            <tbody>
              <tr className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}>
                <td className={`${tdFirstBody} text-left`}>
                  <span className="block px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                    {quantidadeUnReadOnly
                      ? 'Quantidade (calculada: carga de entulho no bloco, 1 caçamba = 4 m³)'
                      : 'Quantidade do item (unidades)'}
                  </span>
                </td>
                {celulaVazia()}
                {celulaVazia()}
                {celulaVazia()}
                <td className={`${tdRestBody} text-center`}>
                  {quantidadeUnReadOnly ? (
                    <span
                      className="block px-2 py-2.5 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100"
                      title="Ajuste as medições da carga manual de entulho e das demolições no mesmo bloco"
                    >
                      {fmtUn}
                    </span>
                  ) : (
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={
                        draftCalc[draftKeyUn] ??
                        (quantidadeUn === 0 ? '' : String(quantidadeUn))
                      }
                      onChange={e =>
                        handleCalcChange(draftKeyUn, e.target.value, aplicarQtd)
                      }
                      onBlur={e =>
                        handleCalcBlur(draftKeyUn, draftCalc[draftKeyUn] ?? e.target.value, aplicarQtd)
                      }
                      className={`${inputCls} text-center`}
                    />
                  )}
                </td>
                {celulaVazia()}
                {celulaVazia()}
                {celulaVazia()}
                <td className={tdCalc} title="Quantidade total (UN)">
                  {fmtUn}
                </td>
              </tr>
            </tbody>
          </>
        )}
      </div>
    );
  }

  if (!dim.linhas?.length) {
    const colEmpty = contarColunasGrade();
    if (ehCargaEntulho) {
      return (
        <>
        <div className="space-y-3">
          {tabelaEnvoltorio(
            <>
              <thead>{renderCabecalhoServico(colEmpty)}</thead>
              <tbody>
                <tr className={gradeTableRowTrCls}>
                  <td
                    colSpan={colEmpty}
                    className="border-b border-gray-200 bg-slate-50/60 px-6 py-8 text-center dark:border-gray-600 dark:bg-gray-900/50"
                  >
                    <div className="flex justify-center">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        <Info className="h-5 w-5" strokeWidth={2} aria-hidden />
                      </span>
                    </div>
                    <p className="mx-auto mt-3 max-w-lg text-sm font-medium leading-relaxed text-gray-800 dark:text-gray-200">
                      A carga manual de entulho não é medida aqui: o volume vem dos demais serviços do mesmo bloco
                      (demolições, remoções, escavações etc.).
                    </p>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      Inclua primeiro, na aba <span className="font-medium text-gray-800 dark:text-gray-200">Orçamento</span>, as
                      composições que geram entulho e preencha as medições delas. As linhas desta carga aparecem
                      automaticamente quando houver volume calculado.
                    </p>
                  </td>
                </tr>
              </tbody>
            </>
          )}
        </div>
        {portalMenuCtxMedicao}
        </>
      );
    }
    return (
      <>
      <div className="space-y-3">
        {tabelaEnvoltorio(
          <>
            <thead>
              {renderCabecalhoServico(colEmpty)}
              {renderHeaderRow(lnFallback)}
            </thead>
            <tbody>
              <tr className={gradeTableRowTrCls}>
                <td
                  colSpan={colEmpty}
                  className="border-b border-gray-200 bg-slate-50/40 px-6 py-10 text-center dark:border-gray-600 dark:bg-gray-900/40"
                >
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    Nenhuma linha de medição. Inicie o cadastro das medidas conforme o tipo de serviço.
                  </p>
                  <button
                    type="button"
                    onClick={() => addLinhaMedicao(rowKey)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                  >
                    <Plus className="h-4 w-4" />
                    Iniciar medições
                  </button>
                </td>
              </tr>
            </tbody>
          </>
        )}
      </div>
      {portalMenuCtxMedicao}
      </>
    );
  }

  if (!ehCargaEntulho) {
    const lnHeaderRef = dim.linhas.find(l => !l.cabecalhoSecao) ?? dim.linhas[0];
    const colCount = contarColunasGrade();
    return (
      <>
      <div className="space-y-3">
        {tabelaEnvoltorio(
          <>
            <thead>
              {renderCabecalhoServico(colCount)}
              {renderHeaderRow(lnHeaderRef)}
            </thead>
            <tbody>{dim.linhas.map((ln, idx) => renderRow(ln, idx))}</tbody>
          </>
        )}
      </div>
      {portalMenuCtxMedicao}
      </>
    );
  }

  /** Carga de entulho: uma tabela contínua (sem sub-blocos nem faixa duplicada por composição). */
  const lnHeaderCarga = dim.linhas.find(l => !l.cabecalhoSecao) ?? dim.linhas[0];
  const colCountCarga = contarColunasGrade();
  return (
    <>
      <div className="space-y-3">
        {tabelaEnvoltorio(
          <>
            <thead>
              {renderCabecalhoServico(colCountCarga)}
              {renderHeaderRow(lnHeaderCarga)}
            </thead>
            <tbody>{dim.linhas.map((ln, idx) => renderRow(ln, idx))}</tbody>
          </>
        )}
      </div>
      {portalMenuCtxMedicao}
    </>
  );
}
