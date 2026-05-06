'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { ArrowLeft, FileDown, FileSpreadsheet } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { formatOsSePasta, formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import toast from 'react-hot-toast';

/** Campos alinhados ao modelo Pleito (API) para exportação completa. */
interface ContractPleito {
  id: string;
  divSe: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  lot: string | null;
  location: string | null;
  unit: string | null;
  serviceDescription: string;
  executionStatus: string | null;
  budget: string | null;
  billingStatus: string | null;
  updatedContractId: string | null;
  accumulatedBilled: number | null;
  billingRequest: number | null;
  invoiceNumber: string | null;
  estimator: string | null;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  pv: string | null;
  ipi: string | null;
  reportsBilling: string | null;
  engineer: string | null;
  supervisor: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ContractBrief {
  id: string;
  name: string;
  number: string;
}

const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function numOrEmpty(v: number | null | undefined): number | string {
  if (v == null || Number.isNaN(Number(v))) return '';
  return Number(v);
}

/** Uma linha do Excel com todos os campos da OS (sem colunas de identificadores internos). */
function pleitoToXlsxRow(p: ContractPleito): (string | number)[] {
  return [
    formatOsSePasta(p.divSe, p.folderNumber),
    p.creationMonth ?? '',
    p.creationYear ?? '',
    p.startDate ? formatDate(p.startDate) : '',
    p.endDate ? formatDate(p.endDate) : '',
    p.budgetStatus ?? '',
    p.lot ?? '',
    p.location ?? '',
    p.unit ?? '',
    p.serviceDescription ?? '',
    p.budget ?? '',
    p.executionStatus ?? '',
    p.billingStatus ?? '',
    numOrEmpty(p.accumulatedBilled),
    numOrEmpty(p.billingRequest),
    p.invoiceNumber ?? '',
    p.estimator ?? '',
    numOrEmpty(p.budgetAmount1),
    numOrEmpty(p.budgetAmount2),
    numOrEmpty(p.budgetAmount3),
    numOrEmpty(p.budgetAmount4),
    p.pv ?? '',
    p.ipi ?? '',
    p.reportsBilling ?? '',
    p.engineer ?? '',
    p.supervisor ?? '',
    p.createdAt ? formatDateTime(p.createdAt) : '',
    p.updatedAt ? formatDateTime(p.updatedAt) : ''
  ];
}

const PLEITO_XLSX_HEADERS = [
  'OS / SE',
  'Mês criação',
  'Ano criação',
  'Data início',
  'Data término',
  'Status Orçamento',
  'Lote',
  'Local',
  'Unidade',
  'Descrição do serviço',
  'Orçamento',
  'Status Execução',
  'Status Faturamento',
  'Acumulado faturado',
  'Valor pleiteado',
  'Nº NF',
  'Orçamentista',
  'Orçamento R01',
  'Orçamento R02',
  'Orçamento R03',
  'Orçamento R04',
  'RVI',
  'RVF',
  'Feedback relatórios',
  'Engenheiro',
  'Encarregado',
  'Criado em',
  'Atualizado em'
];

export default function CronogramaMensalPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = params?.id;
  const contractId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? idParam[0] ?? '' : '';

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const selectedIds = useMemo(() => {
    const raw = searchParams?.get('selectedIds');
    if (!raw) return new Set<string>();
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }, [searchParams]);

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId
  });

  const { data: pleitosData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId
  });

  const allPleitos = (Array.isArray(pleitosData) ? pleitosData : (pleitosData as { data?: ContractPleito[] })?.data) || [];
  const pleitos = allPleitos.filter((p) => (p.reportsBilling || '').trim() !== PLEITO_HISTORY_MARKER);

  const rows = useMemo(() => {
    return pleitos.filter((p) => selectedIds.has(p.id));
  }, [pleitos, selectedIds]);

  const contract = (contractData as { data?: ContractBrief } | undefined)?.data;

  const exportXlsx = () => {
    if (rows.length === 0) {
      toast.error('Não há ordens para exportar.');
      return;
    }
    const data = rows.map((p) => pleitoToXlsxRow(p as ContractPleito));
    const ws = XLSX.utils.aoa_to_sheet([PLEITO_XLSX_HEADERS, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cronograma Mensal');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cronograma-mensal-${date}.xlsx`);
    toast.success('Arquivo XLSX gerado.');
  };

  const loadLogoBase64 = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        try {
          resolve(c.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/logobranca.png';
    });
  };

  const exportPdf = async () => {
    if (rows.length === 0) {
      toast.error('Não há ordens para exportar.');
      return;
    }
    try {
      const logoBase64 = await loadLogoBase64();
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let y = margin;

      pdf.setFillColor(79, 70, 229);
      pdf.rect(0, 0, pageWidth, 26, 'F');
      if (logoBase64) {
        pdf.addImage(logoBase64, 'PNG', margin, 5, 16, 14);
      }
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Cronograma Mensal', pageWidth / 2, 16, { align: 'center' });
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      if (contract) {
        pdf.text(`${contract.name} - nº ${contract.number}`, pageWidth / 2, 21, { align: 'center' });
      }
      pdf.setTextColor(0, 0, 0);
      y = 32;

      const colW = [36, 44, 20, 20, 20, 26, 26, 26, 26];
      const headers = ['OS/SE', 'Descrição', 'Mês/Ano', 'Início', 'Término', 'St. Orç.', 'St. Exec.', 'Orçamento', 'Eng.'];
      const totalW = colW.reduce((a, b) => a + b, 0);
      const rowH = 7;
      const startX = margin;

      pdf.setFillColor(55, 65, 81);
      pdf.rect(startX, y, totalW, rowH, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      let x = startX;
      headers.forEach((h, i) => {
        pdf.text(h, x + 2, y + 4.5);
        x += colW[i];
      });
      pdf.setTextColor(0, 0, 0);
      y += rowH;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);

      rows.forEach((p, idx) => {
        if (y + rowH > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        if (idx % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(startX, y, totalW, rowH, 'F');
        }
        const mesAno =
          p.creationMonth && p.creationYear
            ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
            : '—';
        const cells = [
          formatOsSePasta(p.divSe, p.folderNumber).slice(0, 24) || '—',
          (p.serviceDescription || '—').slice(0, 40),
          mesAno,
          formatDate(p.startDate),
          formatDate(p.endDate),
          (p.budgetStatus || '—').slice(0, 18),
          (p.executionStatus || '—').slice(0, 20),
          p.budget ? formatCurrency(Number(p.budget)) : '—',
          (p.engineer || '—').slice(0, 14)
        ];
        x = startX;
        cells.forEach((cell, i) => {
          pdf.text(String(cell), x + 2, y + 4.5);
          x += colW[i];
        });
        y += rowH;
      });

      pdf.save(`cronograma-mensal-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF gerado.');
    } catch {
      toast.error('Erro ao gerar PDF.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  if (loadingContract || !contractId) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href={`/ponto/contratos/${contractId}`}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao contrato
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cronograma Mensal</h1>
              {contract && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {contract.number} – {contract.name}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportXlsx}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Exportar XLSX
              </button>
              <button
                type="button"
                onClick={exportPdf}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
              >
                <FileDown className="w-4 h-4" />
                Exportar PDF
              </button>
            </div>
          </div>

          {loadingPleitos ? (
            <Loading />
          ) : selectedIds.size === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              Nenhuma ordem de serviço selecionada. No contrato, marque as OS na tabela e use &quot;Gerar cronograma mensal&quot;.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Nenhuma das ordens selecionadas foi encontrada para este contrato.</p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto bg-white dark:bg-gray-900/50">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">OS / SE</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Mês/Ano criação</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Data início</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Data término</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Status Orçamento</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Status Execução</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">Orçamento</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Engenheiro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((p) => {
                    const mesAno =
                      p.creationMonth && p.creationYear
                        ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
                        : '—';
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">
                          {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.serviceDescription || ''}>
                          {p.serviceDescription || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{mesAno}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatDate(p.startDate)}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatDate(p.endDate)}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 align-middle">
                          <span className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)} title={p.budgetStatus || ''}>
                            {p.budgetStatus || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 align-middle">
                          <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)} title={p.executionStatus || ''}>
                            {p.executionStatus || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {p.budget ? formatCurrency(Number(p.budget)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{p.engineer || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
