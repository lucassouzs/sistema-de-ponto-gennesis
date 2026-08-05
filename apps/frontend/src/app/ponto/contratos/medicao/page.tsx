'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  X,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  FilePlus,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ItemMedicao {
  descricao: string;
  unidade: string;
  quantidade: string;
  /** Título do bloco de serviço (ex.: SERVIÇOS COMPLEMENTARES) */
  isGrupo?: boolean;
}

interface ArquivoMedicao {
  id: string;
  nomeArquivo: string;
  zona: string;
  medicao: string;
  escola: string;
  aba: string;
  items: ItemMedicao[];
  erro?: string;
  expandido: boolean;
}

// ─── Utilitários de parsing ───────────────────────────────────────────────────

const EXTENSOES_EXCEL = /\.(xlsx|xlsm|xlsb|xls)$/i;

const BTN_BASE =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer';
const BTN_AZUL = `${BTN_BASE} bg-blue-600 hover:bg-blue-700 text-white`;
const BTN_VERDE = `${BTN_BASE} bg-emerald-600 hover:bg-emerald-700 text-white`;
const BTN_OUTLINE =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';
const BTN_ICONE_LIMPAR =
  'inline-flex items-center justify-center p-2 text-red-500 hover:text-red-600 transition-colors cursor-pointer';

const MAX_HISTORICO_REMOCOES = 500;

function isArquivoExcel(file: File): boolean {
  return EXTENSOES_EXCEL.test(file.name);
}

function normalizar(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function encontrarAba(workbook: XLSX.WorkBook): { nome: string; sheet: XLSX.WorkSheet } | null {
  const nomes = workbook.SheetNames;

  // Prioridade: aba com nome "medicao", "medicão", ou "orcamento sintetico"
  for (const nome of nomes) {
    const n = normalizar(nome);
    if (
      n === 'medicao' ||
      n === 'medicoes' ||
      n.includes('orcamento sintetico') ||
      n.includes('orcamento  sintetico')
    ) {
      return { nome, sheet: workbook.Sheets[nome] };
    }
  }

  // Busca parcial
  for (const nome of nomes) {
    const n = normalizar(nome);
    if (n.includes('medicao') || n.includes('sintetico')) {
      return { nome, sheet: workbook.Sheets[nome] };
    }
  }

  // Segunda aba (padrão)
  if (nomes.length >= 2) {
    return { nome: nomes[1], sheet: workbook.Sheets[nomes[1]] };
  }

  if (nomes.length > 0) {
    return { nome: nomes[0], sheet: workbook.Sheets[nomes[0]] };
  }

  return null;
}

function encontrarLinhaCabecalho(
  rows: any[][]
): { headerRow: number; descIdx: number; undIdx: number; qtdIdx: number } | null {
  const limit = Math.min(rows.length, 40);

  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    const norm = row.map((cell: any) => normalizar(String(cell ?? '')));

    const descIdx = norm.findIndex(
      (h) => h.includes('descri') || h === 'descricao' || h === 'item descricao'
    );
    const undIdx = norm.findIndex(
      (h) => h === 'und' || h === 'un' || h === 'unid' || h.includes('unidade')
    );
    const qtdIdx = norm.findIndex(
      (h) =>
        h === 'qtde' ||
        h === 'qtd' ||
        h === 'quant' ||
        h.includes('quantidade') ||
        h.startsWith('qtd')
    );

    if (descIdx >= 0 && (undIdx >= 0 || qtdIdx >= 0)) {
      return { headerRow: r, descIdx, undIdx: undIdx >= 0 ? undIdx : -1, qtdIdx: qtdIdx >= 0 ? qtdIdx : -1 };
    }
  }

  return null;
}

/**
 * Converte quantidade da planilha (BR ou numérico do Excel) para número.
 * BR: 170,00 | 1,20 | 1.234,56  —  US/string Excel: 170.00 | 1.20
 */
function parseQuantidadeNumero(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const s = String(raw).trim();
  if (!s || s === '-' || s === '–') return null;

  const normalized = s.replace(/\s/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  let numStr: string;

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      numStr = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      numStr = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    numStr = normalized.replace(',', '.');
  } else if (hasDot) {
    const parts = normalized.split('.');
    if (parts.length > 2) {
      numStr = normalized.replace(/\./g, '');
    } else if (parts.length === 2) {
      const dec = parts[1];
      if (dec.length <= 2) {
        numStr = normalized;
      } else if (dec.length === 3 && parts[0].length <= 3) {
        numStr = parts[0] + dec;
      } else {
        numStr = normalized;
      }
    } else {
      numStr = normalized;
    }
  } else {
    numStr = normalized;
  }

  const num = parseFloat(numStr);
  return Number.isFinite(num) ? num : null;
}

function formatarQuantidade(raw: unknown): string {
  const num = parseQuantidadeNumero(raw);
  if (num === null) return '';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** Ignora cabeçalhos de seção, totais e linhas de rodapé da planilha. */
function isDescricaoIgnorada(descricao: string): boolean {
  const d = normalizar(descricao);
  if (!d) return true;
  if (d.startsWith('total')) return true;
  if (d.includes('administracao local')) return true;
  if (d.includes('sem reajuste')) return true;
  if (d.includes('com adm')) return true;
  if (d.includes('subtotal') || d.includes('valor total')) return true;
  return false;
}

/** Só importa linha de serviço: descrição + unidade + quantidade numérica preenchidas. */
function isLinhaItemMedicao(descricao: string, unidade: string, qtdRaw: unknown): boolean {
  if (isDescricaoIgnorada(descricao)) return false;
  const und = unidade.trim();
  if (!und || und === '-' || und === '–') return false;
  return parseQuantidadeNumero(qtdRaw) !== null;
}

/** Título de seção: tem descrição, mas sem unidade nem quantidade (ex.: SERVIÇOS COMPLEMENTARES). */
function isLinhaTituloSecao(descricao: string, unidade: string, qtdRaw: unknown): boolean {
  if (!descricao || isDescricaoIgnorada(descricao)) return false;
  if (isLinhaItemMedicao(descricao, unidade, qtdRaw)) return false;
  const und = unidade.trim();
  if (und && und !== '-' && und !== '–') return false;
  if (parseQuantidadeNumero(qtdRaw) !== null) return false;
  return true;
}

async function parseArquivo(file: File): Promise<Omit<ArquivoMedicao, 'id' | 'expandido'>> {
  const relativePath = (file as any).webkitRelativePath as string | undefined;
  const parts = relativePath ? relativePath.replace(/\\/g, '/').split('/') : [];

  // Estrutura esperada: ZN/4ª MED/arquivo.xlsx  (3 partes)
  let zona = '';
  let medicao = '';

  if (parts.length >= 3) {
    zona = parts[parts.length - 3] || '';
    medicao = parts[parts.length - 2] || '';
  } else if (parts.length === 2) {
    medicao = parts[0] || '';
  }

  const nomeArquivo = file.name;
  const escola = nomeArquivo.replace(/\.(xlsx|xlsm|xlsb|xls)$/i, '');

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const abaResult = encontrarAba(workbook);
    if (!abaResult) {
      return { nomeArquivo, zona, medicao, escola, aba: '', items: [], erro: 'Nenhuma aba válida encontrada' };
    }

    const { nome: nomeAba, sheet } = abaResult;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
    }) as any[][];

    const cabecalho = encontrarLinhaCabecalho(rows);
    if (!cabecalho) {
      return {
        nomeArquivo,
        zona,
        medicao,
        escola,
        aba: nomeAba,
        items: [],
        erro: 'Cabeçalho não encontrado (Descrição / Und / Qtde.)',
      };
    }

    const { headerRow, descIdx, undIdx, qtdIdx } = cabecalho;
    const items: ItemMedicao[] = [];
    let tituloPendente: string | null = null;
    let ultimoTituloInserido: string | null = null;

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const descricao = String(row[descIdx] ?? '').trim();
      const unidade = undIdx >= 0 ? String(row[undIdx] ?? '').trim() : '';
      const qtdRaw = qtdIdx >= 0 ? row[qtdIdx] : '';

      if (isLinhaTituloSecao(descricao, unidade, qtdRaw)) {
        tituloPendente = descricao;
        continue;
      }

      if (!isLinhaItemMedicao(descricao, unidade, qtdRaw)) continue;

      // Insere o título do serviço só quando há itens abaixo dele
      if (tituloPendente && tituloPendente !== ultimoTituloInserido) {
        items.push({
          descricao: tituloPendente,
          unidade: '',
          quantidade: '',
          isGrupo: true,
        });
        ultimoTituloInserido = tituloPendente;
      }
      tituloPendente = null;

      items.push({
        descricao,
        unidade,
        quantidade: formatarQuantidade(qtdRaw),
        isGrupo: false,
      });
    }

    return { nomeArquivo, zona, medicao, escola, aba: nomeAba, items };
  } catch (err) {
    return {
      nomeArquivo,
      zona,
      medicao,
      escola,
      aba: '',
      items: [],
      erro: `Erro ao processar: ${(err as Error).message}`,
    };
  }
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Resumo do arquivo (lista + modal) ───────────────────────────────────────

function CabecalhoGrupoMedicao({
  med,
  arquivos,
}: {
  med: string;
  arquivos: ArquivoMedicao[];
}) {
  const totalItens = arquivos.reduce(
    (s, a) => s + a.items.filter((i) => !i.isGrupo).length,
    0
  );
  const qtdErros = arquivos.filter((a) => a.erro).length;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
      <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{med}</h3>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {arquivos.length} {arquivos.length === 1 ? 'orçamento' : 'orçamentos'}
        <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
        {totalItens} {totalItens === 1 ? 'item' : 'itens'}
        {qtdErros > 0 && (
          <span className="text-red-500 dark:text-red-400">
            <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
            {qtdErros} com erro
          </span>
        )}
      </span>
    </div>
  );
}

function ResumoArquivoMedicao({ arquivo }: { arquivo: ArquivoMedicao }) {
  const totalItens = arquivo.items.filter((i) => !i.isGrupo).length;
  const comErro = Boolean(arquivo.erro);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {arquivo.zona && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              comErro
                ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            }`}
          >
            {arquivo.zona}
          </span>
        )}
        {arquivo.medicao && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              comErro
                ? 'bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            }`}
          >
            {arquivo.medicao}
          </span>
        )}
        <span
          className={`text-sm font-medium truncate ${
            comErro
              ? 'text-red-900 dark:text-red-100'
              : 'text-slate-800 dark:text-slate-200'
          }`}
        >
          {arquivo.escola}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1">
        {comErro ? (
          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={12} className="shrink-0 text-red-500" />
            {arquivo.erro}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <CheckCircle size={12} className="text-emerald-500" />
            {totalItens} {totalItens === 1 ? 'item' : 'itens'} · Aba: <em>{arquivo.aba}</em>
          </span>
        )}
      </div>
    </>
  );
}

// ─── Componente de card por arquivo ──────────────────────────────────────────

interface ArquivoCardProps {
  arquivo: ArquivoMedicao;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function ArquivoCard({ arquivo, onToggle, onRemove }: ArquivoCardProps) {
  const comErro = Boolean(arquivo.erro);

  return (
    <div
      id={`arquivo-medicao-${arquivo.id}`}
      className={`border rounded-xl overflow-hidden shadow-sm scroll-mt-24 ${
        comErro
          ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
      }`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${
          comErro ? '' : 'bg-slate-50 dark:bg-slate-800/60'
        }`}
        onClick={() => onToggle(arquivo.id)}
      >
        <div className="flex-1 min-w-0">
          <ResumoArquivoMedicao arquivo={arquivo} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(arquivo.id);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              comErro
                ? 'text-red-400 hover:text-red-200 hover:bg-red-900/30'
                : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
            title="Remover arquivo"
          >
            <X size={15} />
          </button>
          {arquivo.expandido ? (
            <ChevronUp size={16} className={comErro ? 'text-red-400' : 'text-slate-400'} />
          ) : (
            <ChevronDown size={16} className={comErro ? 'text-red-400' : 'text-slate-400'} />
          )}
        </div>
      </div>

      {/* Tabela de itens */}
      {arquivo.expandido && !arquivo.erro && arquivo.items.length > 0 && (
        <div className="table-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700">
                <th className="text-left px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 w-[60%]">Descrição</th>
                <th className="text-center px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 w-[12%]">Und</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 w-[14%]">Qtde.</th>
              </tr>
            </thead>
            <tbody>
              {arquivo.items.map((item, idx) =>
                item.isGrupo ? (
                  <tr key={idx} className="bg-slate-700 dark:bg-slate-600">
                    <td colSpan={3} className="px-4 py-1.5 font-semibold text-xs text-white tracking-wide uppercase">
                      {item.descricao}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={idx}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{item.descricao}</td>
                    <td className="px-3 py-2 text-center text-slate-500 dark:text-slate-400">{item.unidade}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{item.quantidade}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {arquivo.expandido && !arquivo.erro && arquivo.items.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-slate-400">
          Nenhum item encontrado neste arquivo.
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MedicaoPage() {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<ArquivoMedicao[]>([]);
  const [historicoRemocoes, setHistoricoRemocoes] = useState<ArquivoMedicao[]>([]);
  const [processando, setProcessando] = useState(false);
  const [progressoImport, setProgressoImport] = useState<{
    atual: number;
    total: number;
  } | null>(null);
  const inputFilesRef = useRef<HTMLInputElement>(null);
  const inputFolderRef = useRef<HTMLInputElement>(null);

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });
  const user = userData?.data ?? { name: 'Usuário', role: 'EMPLOYEE' };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const processarArquivos = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const arquivosExcel = Array.from(fileList).filter(isArquivoExcel);

    if (arquivosExcel.length === 0) {
      const total = fileList.length;
      toast.error(
        total > 0
          ? `Nenhuma planilha Excel reconhecida entre ${total} arquivo(s). Use .xlsx, .xlsm, .xls ou .xlsb.`
          : 'Nenhum arquivo selecionado.'
      );
      return;
    }

    setProcessando(true);
    setProgressoImport({ atual: 0, total: arquivosExcel.length });

    try {
      const novos: ArquivoMedicao[] = [];

      for (let i = 0; i < arquivosExcel.length; i++) {
        const resultado = await parseArquivo(arquivosExcel[i]);
        novos.push({
          ...resultado,
          id: uid(),
          expandido: false,
        });
        setProgressoImport({ atual: i + 1, total: arquivosExcel.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      setArquivos((prev) => [...prev, ...novos]);

      const erros = novos.filter((a) => a.erro).length;
      const ok = novos.length - erros;
      toast.success(
        `${ok} arquivo(s) importado(s)${erros > 0 ? ` · ${erros} com erro` : ''}`
      );
    } catch {
      toast.error('Erro inesperado ao processar arquivos.');
    } finally {
      setProcessando(false);
      setProgressoImport(null);
    }
  }, []);

  const toggleExpandido = useCallback((id: string) => {
    setArquivos((prev) =>
      prev.map((a) => (a.id === id ? { ...a, expandido: !a.expandido } : a))
    );
  }, []);

  const registrarRemocao = useCallback((removidos: ArquivoMedicao[]) => {
    if (removidos.length === 0) return;
    setHistoricoRemocoes((h) => {
      const next = [...h, ...removidos];
      return next.length > MAX_HISTORICO_REMOCOES
        ? next.slice(-MAX_HISTORICO_REMOCOES)
        : next;
    });
  }, []);

  const removerArquivos = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      setArquivos((prev) => {
        const removidos = prev.filter((a) => idSet.has(a.id));
        const restante = prev.filter((a) => !idSet.has(a.id));
        if (removidos.length > 0) registrarRemocao(removidos);
        return restante;
      });
    },
    [registrarRemocao]
  );

  const removerArquivo = useCallback(
    (id: string) => {
      removerArquivos([id]);
    },
    [removerArquivos]
  );

  const podeRefazer = historicoRemocoes.length > 0;

  const refazerUltimaRemocao = () => {
    setHistoricoRemocoes((hist) => {
      if (hist.length === 0) {
        toast.error('Nenhuma exclusão para refazer.');
        return hist;
      }
      const ultimo = hist[hist.length - 1];
      setArquivos((prev) => {
        if (prev.some((a) => a.id === ultimo.id)) return prev;
        return [...prev, ultimo];
      });
      toast.success('1 arquivo restaurado.');
      return hist.slice(0, -1);
    });
  };

  const arquivosComErro = useMemo(() => arquivos.filter((a) => a.erro), [arquivos]);
  const quantidadeErros = arquivosComErro.length;

  const [modalErrosAberto, setModalErrosAberto] = useState(false);
  const [indiceErroNavegacao, setIndiceErroNavegacao] = useState(0);

  useEffect(() => {
    if (quantidadeErros === 0) {
      setModalErrosAberto(false);
      setIndiceErroNavegacao(0);
      return;
    }
    if (indiceErroNavegacao >= quantidadeErros) {
      setIndiceErroNavegacao(quantidadeErros - 1);
    }
  }, [quantidadeErros, indiceErroNavegacao]);

  const erroAtual = arquivosComErro[indiceErroNavegacao] ?? null;

  const irParaArquivoErro = useCallback(
    (indice: number) => {
      const alvo = arquivosComErro[indice];
      if (!alvo) return;
      setIndiceErroNavegacao(indice);
      setArquivos((prev) =>
        prev.map((a) => (a.id === alvo.id ? { ...a, expandido: true } : a))
      );
      requestAnimationFrame(() => {
        document
          .getElementById(`arquivo-medicao-${alvo.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [arquivosComErro]
  );

  const navegarIndiceErro = useCallback(
    (direcao: -1 | 1) => {
      if (quantidadeErros === 0) return;
      setIndiceErroNavegacao(
        (prev) => (prev + direcao + quantidadeErros) % quantidadeErros
      );
    },
    [quantidadeErros]
  );

  const navegarErroNaLista = useCallback(
    (direcao: -1 | 1) => {
      if (quantidadeErros === 0) return;
      const proximo =
        (indiceErroNavegacao + direcao + quantidadeErros) % quantidadeErros;
      irParaArquivoErro(proximo);
    },
    [quantidadeErros, indiceErroNavegacao, irParaArquivoErro]
  );

  const abrirModalErros = (indice = indiceErroNavegacao) => {
    setIndiceErroNavegacao(Math.min(indice, Math.max(0, quantidadeErros - 1)));
    setModalErrosAberto(true);
  };

  const removerErroAtual = () => {
    if (!erroAtual) return;
    removerArquivo(erroAtual.id);
    toast.success('Arquivo com erro removido.');
  };

  const removerTodosComErro = () => {
    const qtd = quantidadeErros;
    const ids = arquivosComErro.map((a) => a.id);
    removerArquivos(ids);
    setModalErrosAberto(false);
    toast.success(`${qtd} arquivo(s) com erro removido(s).`);
  };

  useEffect(() => {
    if (!modalErrosAberto || quantidadeErros === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navegarIndiceErro(-1);
      if (e.key === 'ArrowRight') navegarIndiceErro(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalErrosAberto, quantidadeErros, navegarIndiceErro]);

  const todosExpandidos =
    arquivos.length > 0 && arquivos.every((a) => a.expandido);

  const alternarExpansaoTodos = () => {
    const expandir = !todosExpandidos;
    setArquivos((prev) => prev.map((a) => ({ ...a, expandido: expandir })));
  };

  const limparTudo = () => {
    setArquivos((prev) => {
      if (prev.length > 0) registrarRemocao(prev);
      return [];
    });
    if (inputFilesRef.current) inputFilesRef.current.value = '';
    if (inputFolderRef.current) inputFolderRef.current.value = '';
  };

  const exportarExcel = () => {
    if (arquivos.length === 0) {
      toast.error('Nenhum dado para exportar.');
      return;
    }

    const rows: (string | number)[][] = [
      ['Zona', 'Medição', 'Orçamento / Local', 'Aba', 'Descrição', 'Und', 'Qtde.'],
    ];

    for (const arq of arquivos) {
      for (const item of arq.items) {
        rows.push([
          arq.zona,
          arq.medicao,
          arq.escola,
          arq.aba,
          item.descricao,
          item.isGrupo ? '' : item.unidade,
          item.isGrupo ? '' : item.quantidade,
        ]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 48 }, { wch: 22 }, { wch: 60 }, { wch: 8 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medições');
    XLSX.writeFile(wb, `medicoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Exportado com sucesso.');
  };

  // ─── Agrupamento por zona → medição ─────────────────────────────────────────

  const grupos = arquivos.reduce<Record<string, Record<string, ArquivoMedicao[]>>>(
    (acc, arq) => {
      const zona = arq.zona || 'Sem zona';
      const med = arq.medicao || 'Sem medição';
      if (!acc[zona]) acc[zona] = {};
      if (!acc[zona][med]) acc[zona][med] = [];
      acc[zona][med].push(arq);
      return acc;
    },
    {}
  );

  const totalItens = arquivos.reduce(
    (sum, a) => sum + a.items.filter((i) => !i.isGrupo).length,
    0
  );

  const isDragging = useRef(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      void processarArquivos(e.dataTransfer.files);
    },
    [processarArquivos]
  );

  return (
    <ProtectedRoute route="/ponto/contratos/medicao">
      <MainLayout
        userRole={user.role}
        userName={user.name}
        onLogout={handleLogout}
      >
        <div className="w-full space-y-6">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                Medições
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Importe planilhas de medição e visualize os itens extraídos.
              </p>
            </div>

            {/* Área de importação */}
            <Card>
              <CardContent className="p-6">
                {processando && progressoImport ? (
                  <div className="py-8 space-y-5">
                    <p className="text-sm font-medium text-center text-gray-800 dark:text-gray-200">
                      Processando planilhas…
                    </p>
                    <div className="w-full space-y-2">
                      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                        <span>Progresso</span>
                        <span className="tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                          {progressoImport.atual} / {progressoImport.total}
                          {' '}
                          <span className="font-normal text-gray-500 dark:text-gray-400">
                            ({Math.round((progressoImport.atual / progressoImport.total) * 100)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-150 ease-out"
                          style={{
                            width: `${Math.min(
                              100,
                              (progressoImport.atual / progressoImport.total) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                      Aguarde, não feche esta página.
                    </p>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-xl text-center transition-colors p-8 ${
                      dragOver
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-300 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <>
                      <Upload size={36} className="mx-auto mb-3 text-slate-400" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Arraste arquivos aqui ou use os botões abaixo
                      </p>
                      <p className="text-xs text-slate-400 mb-5">
                        Suporta múltiplos arquivos .xlsx, .xlsm e .xls. Detecta automaticamente a aba de medição.
                      </p>

                      <div className="flex flex-wrap justify-center gap-3">
                        <label className={BTN_AZUL}>
                          <FilePlus size={16} />
                          Importar Arquivos
                          <input
                            ref={inputFilesRef}
                            type="file"
                            accept=".xlsx,.xlsm,.xlsb,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            multiple
                            className="hidden"
                            onChange={(e) => void processarArquivos(e.target.files)}
                          />
                        </label>

                        <label className={BTN_VERDE}>
                          <FolderOpen size={16} />
                          Importar Pasta
                          <input
                            ref={inputFolderRef}
                            type="file"
                            accept=".xlsx,.xlsm,.xlsb,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            multiple
                            // @ts-expect-error - atributo não padrão suportado por Chrome/Edge
                            webkitdirectory="true"
                            className="hidden"
                            onChange={(e) => void processarArquivos(e.target.files)}
                          />
                        </label>
                      </div>
                    </>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Barra de ações + estatísticas */}
            {arquivos.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-3 shadow-sm">
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>
                    <strong className="text-gray-900 dark:text-gray-100">{arquivos.length}</strong> arquivo(s)
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span>
                    <strong className="text-gray-900 dark:text-gray-100">{totalItens}</strong> itens no total
                  </span>
                  {quantidadeErros > 0 && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <div className="flex items-center gap-1">
                        {quantidadeErros > 1 && (
                          <button
                            type="button"
                            onClick={() => navegarErroNaLista(-1)}
                            className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Erro anterior"
                            aria-label="Erro anterior"
                          >
                            <ChevronLeft size={18} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => abrirModalErros()}
                          className="flex items-center gap-1.5 text-red-500 hover:text-red-600 font-medium transition-colors"
                        >
                          <AlertCircle size={14} />
                          {quantidadeErros} com erro
                          {quantidadeErros > 1 && (
                            <span className="text-red-400/90 font-normal tabular-nums">
                              ({indiceErroNavegacao + 1}/{quantidadeErros})
                            </span>
                          )}
                        </button>
                        {quantidadeErros > 1 && (
                          <button
                            type="button"
                            onClick={() => navegarErroNaLista(1)}
                            className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Próximo erro"
                            aria-label="Próximo erro"
                          >
                            <ChevronRight size={18} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={limparTudo}
                    className={BTN_ICONE_LIMPAR}
                    title="Limpar tudo"
                    aria-label="Limpar tudo"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={refazerUltimaRemocao}
                    disabled={!podeRefazer}
                    className={`${BTN_OUTLINE} disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={
                      historicoRemocoes.length > 1
                        ? `Restaurar 1 arquivo (${historicoRemocoes.length} na fila)`
                        : 'Restaurar último arquivo removido'
                    }
                  >
                    <RotateCcw size={16} />
                    Refazer
                    {historicoRemocoes.length > 1 && (
                      <span className="tabular-nums opacity-80">({historicoRemocoes.length})</span>
                    )}
                  </button>
                  <button type="button" onClick={alternarExpansaoTodos} className={BTN_OUTLINE}>
                    {todosExpandidos ? (
                      <>
                        <EyeOff size={16} /> Recolher tudo
                      </>
                    ) : (
                      <>
                        <Eye size={16} /> Expandir tudo
                      </>
                    )}
                  </button>
                  <button type="button" onClick={exportarExcel} className={BTN_VERDE}>
                    <Download size={16} /> Exportar Excel
                  </button>
                </div>
              </div>
            )}

            {/* Lista de arquivos agrupados por zona → medição */}
            {Object.keys(grupos).length > 0 && (
              <div className="space-y-6">
                {Object.entries(grupos).map(([zona, medicoes]) => (
                  <div key={zona}>
                    {/* Título da zona */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 px-2">
                        {zona}
                      </span>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    </div>

                    {Object.entries(medicoes).map(([med, arqs]) => (
                      <div key={med} className="mb-4">
                        <CabecalhoGrupoMedicao med={med} arquivos={arqs} />

                        <div className="space-y-2 pl-3 sm:pl-4 border-l border-gray-200 dark:border-gray-700 ml-0.5">
                          {arqs.map((arq) => (
                            <ArquivoCard
                              key={arq.id}
                              arquivo={arq}
                              onToggle={toggleExpandido}
                              onRemove={removerArquivo}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <Modal
              isOpen={modalErrosAberto && quantidadeErros > 0}
              onClose={() => setModalErrosAberto(false)}
              title={`Arquivos com erro (${quantidadeErros})`}
              size="lg"
              headerActions={
                quantidadeErros > 1 ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => navegarIndiceErro(-1)}
                      className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      aria-label="Anterior"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 min-w-[3rem] text-center">
                      {indiceErroNavegacao + 1} / {quantidadeErros}
                    </span>
                    <button
                      type="button"
                      onClick={() => navegarIndiceErro(1)}
                      className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      aria-label="Próximo"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                ) : undefined
              }
            >
              {erroAtual && (
                <div className="space-y-4">
                  {quantidadeErros > 1 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Arquivo{' '}
                      <strong className="text-gray-900 dark:text-gray-100">
                        {indiceErroNavegacao + 1} de {quantidadeErros}
                      </strong>
                    </p>
                  )}

                  <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3">
                    <ResumoArquivoMedicao arquivo={erroAtual} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        irParaArquivoErro(indiceErroNavegacao);
                        setModalErrosAberto(false);
                      }}
                      className={BTN_OUTLINE}
                    >
                      Ir para na lista
                    </button>
                    <button
                      type="button"
                      onClick={removerErroAtual}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 size={16} />
                      Remover este
                    </button>
                    {quantidadeErros > 1 && (
                      <button
                        type="button"
                        onClick={removerTodosComErro}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
                      >
                        <Trash2 size={16} />
                        Remover todos ({quantidadeErros})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
