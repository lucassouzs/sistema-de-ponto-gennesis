'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatOsSePasta, formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import { Loading } from '@/components/ui/Loading';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { loadPdfBrandingLogoDataUrl } from '@/lib/loadPdfBrandingLogo';

const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';

interface ContractPleito {
  id: string;
  divSe: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  executionStatus: string | null;
  budget: string | null;
  engineer: string | null;
  createdAt?: string;
}

interface ContractBrief {
  name: string;
  number: string;
}

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
    maximumFractionDigits: 2,
  }).format(value);
}

function numOrEmpty(v: number | null | undefined): number | string {
  if (v == null || Number.isNaN(Number(v))) return '';
  return Number(v);
}

function pleitoToXlsxRow(p: ContractPleito): (string | number)[] {
  return [
    formatOsSePasta(p.divSe, p.folderNumber),
    p.creationMonth ?? '',
    p.creationYear ?? '',
    p.startDate ? formatDate(p.startDate) : '',
    p.endDate ? formatDate(p.endDate) : '',
    p.budgetStatus ?? '',
    p.serviceDescription ?? '',
    p.budget ?? '',
    p.executionStatus ?? '',
    p.engineer ?? '',
    p.createdAt ? formatDateTimeBr(p.createdAt, '') : '',
  ];
}

const PLEITO_XLSX_HEADERS = [
  'OS / SE',
  'Mês criação',
  'Ano criação',
  'Data início',
  'Data término',
  'Status Orçamento',
  'Descrição do serviço',
  'Orçamento',
  'Status Execução',
  'Engenheiro',
  'Criado em',
];

type ContractCronogramaMensalPanelProps = {
  contractId: string;
  selectedIds: string[];
};

export function ContractCronogramaMensalPanel({
  contractId,
  selectedIds,
}: ContractCronogramaMensalPanelProps) {
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: pleitosData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const allPleitos =
    (Array.isArray(pleitosData)
      ? pleitosData
      : (pleitosData as { data?: ContractPleito[] })?.data) || [];
  const pleitos = allPleitos.filter(
    (p) => {
      const marker = ((p as ContractPleito & { reportsBilling?: string }).reportsBilling || '').trim();
      return marker !== PLEITO_HISTORY_MARKER && !marker.startsWith(PLEITO_HISTORY_MARKER);
    }
  );

  const rows = useMemo(
    () => pleitos.filter((p) => selectedIdSet.has(p.id)),
    [pleitos, selectedIdSet]
  );

  const contract = (contractData as { data?: ContractBrief } | undefined)?.data;

  const exportXlsx = () => {
    if (rows.length === 0) {
      toast.error('Não há ordens para exportar.');
      return;
    }
    const data = rows.map((p) => pleitoToXlsxRow(p));
    const ws = XLSX.utils.aoa_to_sheet([PLEITO_XLSX_HEADERS, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cronograma Mensal');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cronograma-mensal-${date}.xlsx`);
    toast.success('Arquivo XLSX gerado.');
  };

  const exportPdf = async () => {
    if (rows.length === 0) {
      toast.error('Não há ordens para exportar.');
      return;
    }
    try {
      const logoBase64 = await loadPdfBrandingLogoDataUrl({
        contextLabels: [contract?.name, contract?.number],
        maxW: 16,
        maxH: 14,
      });
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let y = margin;

      pdf.setFillColor(79, 70, 229);
      pdf.rect(0, 0, pageWidth, 26, 'F');
      if (logoBase64) pdf.addImage(logoBase64, 'PNG', margin, 5, 16, 14);
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
          (p.engineer || '—').slice(0, 14),
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

  if (loadingContract || loadingPleitos) {
    return <Loading message="Carregando cronograma..." />;
  }

  if (selectedIdSet.size === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400">
        Nenhuma ordem de serviço selecionada.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400">
        Nenhuma das ordens selecionadas foi encontrada para este contrato.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {contract ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {contract.number} – {contract.name}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportXlsx}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar XLSX
        </button>
        <button
          type="button"
          onClick={exportPdf}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>
      <div className="table-scroll rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/50">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">OS / SE</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Descrição</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Mês/Ano criação
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Data início
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Data término
              </th>
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
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                    {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                  </td>
                  <td
                    className="max-w-xs truncate px-3 py-2 text-gray-900 dark:text-gray-100"
                    title={p.serviceDescription || ''}
                  >
                    {p.serviceDescription || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">{mesAno}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                    {formatDate(p.startDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                    {formatDate(p.endDate)}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)}>
                      {p.budgetStatus || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)}>
                      {p.executionStatus || '—'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                    {p.budget ? formatCurrency(Number(p.budget)) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                    {p.engineer || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {rows.length} ordem(ns) de serviço no cronograma.
      </p>
    </div>
  );
}
