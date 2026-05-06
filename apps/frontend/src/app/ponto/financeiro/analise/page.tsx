'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, FileText, Loader2, Download, BarChart3, TrendingUp, DollarSign, Calendar, Building2, AlertCircle, CheckCircle2, Eye, ChevronUp, ChevronDown, ArrowUpDown, ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface FinancialAnalysisReport {
  summary: {
    totalRecords: number;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    periodRange: {
      start: string;
      end: string;
    };
  };
  byCompany: Array<{
    company: string;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    recordCount: number;
  }>;
  byCostCenter: Array<{
    costCenter: string;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    recordCount: number;
  }>;
  byNature: Array<{
    nature: string;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    recordCount: number;
  }>;
  bySupplier: Array<{
    supplier: string;
    cpfCnpj: string;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    recordCount: number;
  }>;
  topSuppliers: Array<{
    supplier: string;
    cpfCnpj: string;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    recordCount: number;
  }>;
  byDocumentType: Array<{
    documentType: string;
    totalEntries: number;
    totalExits: number;
    netValue: number;
    recordCount: number;
  }>;
  rawRecords?: Array<{
    coligada: string;
    numerodocumento: string;
    segundonumero: string;
    descricao: string;
    datacriacao: string;
    datacompensacao: string;
    dataemissao: string;
    historico: string;
    ccusto: string;
    natureza: string;
    fornecedor: string;
    cpfCnpj: string;
    saida: number;
    entrada: number;
    tipooperacao: string;
    valortotal: number;
    tipodocumento: string;
  }>;
}

// Função para ordenar arrays genérica (fora do componente para evitar problemas com genéricos)
function sortArray<T>(
  array: T[],
  sortConfig: { column: string | null; direction: 'asc' | 'desc' },
  getValue: (item: T, column: string) => number | string
): T[] {
  if (!sortConfig.column) return array;
  
  const sorted = [...array].sort((a, b) => {
    const valueA = getValue(a, sortConfig.column!);
    const valueB = getValue(b, sortConfig.column!);
    
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      if (sortConfig.direction === 'desc') {
        return valueB - valueA; // Maior para menor
      } else {
        return valueA - valueB; // Menor para maior
      }
    } else {
      const strA = String(valueA).toLowerCase();
      const strB = String(valueB).toLowerCase();
      if (sortConfig.direction === 'desc') {
        return strB.localeCompare(strA);
      } else {
        return strA.localeCompare(strB);
      }
    }
  });
  
  return sorted;
}

export default function AnaliseFinanceiroPage() {
  const pageTitle = 'Análise Financeira';
  const pageSubtitle = 'Importe uma planilha financeira e gere relatórios detalhados de análise';
  const uploadTitle = 'Análise Financeira';
  const uploadSubtitle = 'Importe sua planilha para gerar relatórios detalhados';
  const reportTitle = 'Relatório de Análise Financeira';

  const { isDepartmentFinanceiro, userPosition } = usePermissions();
  const isAdministrator = userPosition === 'Administrador';
  const canAccess = isAdministrator || isDepartmentFinanceiro;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<FinancialAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para controlar modais
  const [showCostCenterModal, setShowCostCenterModal] = useState(false);
  const [showNatureModal, setShowNatureModal] = useState(false);
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [showDocumentTypeModal, setShowDocumentTypeModal] = useState(false);
  
  // Estado para modal de registros detalhados
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<FinancialAnalysisReport['rawRecords']>([]);
  const [selectedRecordTitle, setSelectedRecordTitle] = useState<string>('');
  const [previousModal, setPreviousModal] = useState<'costCenter' | 'nature' | 'suppliers' | 'documentType' | null>(null);
  
  // Estados para ordenação
  const [sortCostCenter, setSortCostCenter] = useState<{ column: 'costCenter' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const [sortNature, setSortNature] = useState<{ column: 'nature' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const [sortSuppliers, setSortSuppliers] = useState<{ column: 'supplier' | 'entries' | 'exits' | 'difference' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const [sortDocumentType, setSortDocumentType] = useState<{ column: 'documentType' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  
  // Estados para ordenação nas modais
  const [sortCostCenterModal, setSortCostCenterModal] = useState<{ column: 'costCenter' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const [sortNatureModal, setSortNatureModal] = useState<{ column: 'nature' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const [sortSuppliersModal, setSortSuppliersModal] = useState<{ column: 'supplier' | 'entries' | 'exits' | 'difference' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const [sortDocumentTypeModal, setSortDocumentTypeModal] = useState<{ column: 'documentType' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });

  const uploadMutation = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/financial-analysis/upload', formData);

      return response.data;
    },
    onSuccess: (data) => {
      setReport(data.data);
      setError(null);
    },
    onError: (error: any) => {
      setError(error.response?.data?.message || 'Erro ao processar planilha. Verifique o formato do arquivo.');
      setReport(null);
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar extensão
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!validExtensions.includes(fileExtension)) {
        setError('Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV (.csv)');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setError(null);
      setReport(null);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setError('Por favor, selecione um arquivo');
      return;
    }

    uploadMutation.mutate({ 
      file: selectedFile
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateString;
    }
  };

  // Função helper para renderizar header clicável
  const renderSortableHeader = (
    label: string,
    column: string,
    currentSort: { column: string | null; direction: 'asc' | 'desc' },
    onSort: (column: string) => void
  ) => {
    const isActive = currentSort.column === column;
    
    return (
      <th 
        className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
        onClick={() => onSort(column)}
      >
        <div className="flex items-center justify-end gap-1">
          <span>{label}</span>
          <div className="flex flex-col">
            {isActive ? (
              currentSort.direction === 'desc' ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </div>
        </div>
      </th>
    );
  };

  // Função helper para header clicável à esquerda (para nomes)
  const renderSortableHeaderLeft = (
    label: string,
    column: string,
    currentSort: { column: string | null; direction: 'asc' | 'desc' },
    onSort: (column: string) => void
  ) => {
    const isActive = currentSort.column === column;
    
    return (
      <th 
        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
        onClick={() => onSort(column)}
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          <div className="flex flex-col">
            {isActive ? (
              currentSort.direction === 'desc' ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </div>
        </div>
      </th>
    );
  };

  const displayReport = report;

  // Função para lidar com clique em uma linha e mostrar registros detalhados
  const handleRowClick = (filterType: 'costCenter' | 'nature' | 'supplier' | 'documentType', filterValue: string, title: string) => {
    if (!displayReport?.rawRecords) return;
    
    const filtered = displayReport.rawRecords.filter(record => {
      switch (filterType) {
        case 'costCenter':
          return (record.ccusto || 'Não informado') === filterValue;
        case 'nature':
          return (record.natureza || 'Não informado') === filterValue;
        case 'supplier':
          return (record.fornecedor || 'Não informado') === filterValue;
        case 'documentType':
          return (record.tipodocumento || 'Não informado') === filterValue;
        default:
          return false;
      }
    });
    
    // Salvar qual modal estava aberto antes
    if (showCostCenterModal) {
      setPreviousModal('costCenter');
      setShowCostCenterModal(false);
    } else if (showNatureModal) {
      setPreviousModal('nature');
      setShowNatureModal(false);
    } else if (showSuppliersModal) {
      setPreviousModal('suppliers');
      setShowSuppliersModal(false);
    } else if (showDocumentTypeModal) {
      setPreviousModal('documentType');
      setShowDocumentTypeModal(false);
    } else {
      setPreviousModal(null);
    }
    
    setSelectedRecords(filtered);
    setSelectedRecordTitle(title);
    setShowRecordsModal(true);
  };

  // Função para voltar ao modal anterior
  const handleBackToPreviousModal = () => {
    setShowRecordsModal(false);
    
    if (previousModal === 'costCenter') {
      setShowCostCenterModal(true);
    } else if (previousModal === 'nature') {
      setShowNatureModal(true);
    } else if (previousModal === 'suppliers') {
      setShowSuppliersModal(true);
    } else if (previousModal === 'documentType') {
      setShowDocumentTypeModal(true);
    }
    
    setPreviousModal(null);
  };

  const handleExportPDF = async () => {
    if (!displayReport) return;

    try {
      // Mostrar loading
      const loadingToast = document.createElement('div');
      loadingToast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      loadingToast.textContent = 'Gerando PDF com gráficos e tabelas...';
      document.body.appendChild(loadingToast);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Função para adicionar nova página se necessário
      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
      };

      // Função para capturar elemento e adicionar ao PDF
      const captureAndAdd = async (element: HTMLElement | null, spacing: number = 15, elementName: string = 'elemento'): Promise<boolean> => {
        if (!element) {
          console.warn(`${elementName} não encontrado`);
          return false;
        }

        try {
          console.log(`Capturando ${elementName}...`);
          
          // Rolar até o elemento
          element.scrollIntoView({ behavior: 'instant', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Verificar se o elemento está visível
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            console.warn(`${elementName} não está visível (width: ${rect.width}, height: ${rect.height})`);
            return false;
          }

          // Capturar elemento
          const canvas = await html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
            width: element.scrollWidth || element.offsetWidth,
            height: element.scrollHeight || element.offsetHeight
          });

          if (!canvas || canvas.width === 0 || canvas.height === 0) {
            console.warn(`${elementName}: Canvas vazio ou inválido`);
            return false;
          }

          console.log(`${elementName} capturado: ${canvas.width}x${canvas.height}px`);

          // Calcular dimensões
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          // Verificar se precisa de nova página
          checkPageBreak(imgHeight + spacing);

          // Adicionar imagem
          pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', margin, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + spacing;

          console.log(`${elementName} adicionado ao PDF com sucesso`);
          return true;
        } catch (error) {
          console.error(`Erro ao capturar ${elementName}:`, error);
          return false;
        }
      };

      // Cabeçalho
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Relatório de Análise Financeira', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const now = new Date();
      pdf.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 20;

      // Resumo (texto)
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Resumo', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total de Registros: ${displayReport.summary.totalRecords.toLocaleString('pt-BR')}`, margin, yPosition);
      yPosition += 7;
      pdf.setTextColor(0, 150, 0);
      pdf.text(`Total de Entradas: ${formatCurrency(displayReport.summary.totalEntries)}`, margin, yPosition);
      yPosition += 7;
      pdf.setTextColor(200, 0, 0);
      pdf.text(`Total de Saídas: ${formatCurrency(displayReport.summary.totalExits)}`, margin, yPosition);
      yPosition += 7;
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Período: ${formatDate(displayReport.summary.periodRange.start)} a ${formatDate(displayReport.summary.periodRange.end)}`, margin, yPosition);
      yPosition += 15;

      // Tabela Por Centro de Custo (texto)
      checkPageBreak(50);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Por Centro de Custo', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Centro de Custo', margin, yPosition);
      pdf.text('Entradas', margin + 80, yPosition);
      pdf.text('Saídas', margin + 110, yPosition);
      pdf.text('Registros', margin + 140, yPosition);
      yPosition += 7;

      pdf.setFont('helvetica', 'normal');
      const sortedCostCenter = sortArray(
        displayReport.byCostCenter,
        sortCostCenter,
        (item, column) => {
          switch (column) {
            case 'costCenter': return item.costCenter || '';
            case 'entries': return item.totalEntries;
            case 'exits': return item.totalExits;
            case 'records': return item.recordCount;
            default: return '';
          }
        }
      );
      sortedCostCenter.slice(0, 10).forEach(item => {
        checkPageBreak(8);
        const costCenter = (item.costCenter || 'Não informado').substring(0, 30);
        pdf.text(costCenter, margin, yPosition);
        pdf.setTextColor(0, 150, 0);
        pdf.text(formatCurrency(item.totalEntries), margin + 80, yPosition);
        pdf.setTextColor(200, 0, 0);
        pdf.text(formatCurrency(item.totalExits), margin + 110, yPosition);
        pdf.setTextColor(0, 0, 0);
        pdf.text(item.recordCount.toString(), margin + 140, yPosition);
        yPosition += 7;
      });
      yPosition += 10;

      // Aguardar um pouco para garantir que os gráficos estejam renderizados
      await new Promise(resolve => setTimeout(resolve, 500));

      // Gráficos Por Centro de Custo (imagens)
      // Buscar dentro da seção do relatório
      const reportSection = document.getElementById('report-section');
      const searchRoot = reportSection || document;
      
      // Buscar todos os Cards visíveis que contêm gráficos (têm SVG)
      const allCards = Array.from(searchRoot.querySelectorAll('[class*="Card"], div[class*="card"]')) as HTMLElement[];
      const cardsWithCharts = allCards.filter(card => {
        const rect = card.getBoundingClientRect();
        const hasSvg = card.querySelector('svg') !== null; // Gráficos têm SVG
        const isVisible = rect.width > 0 && rect.height > 0;
        const isNotModal = !card.closest('[role="dialog"]');
        return isVisible && isNotModal && hasSvg;
      });

      console.log(`Total de Cards encontrados: ${allCards.length}`);
      console.log(`Total de Cards com gráficos (SVG): ${cardsWithCharts.length}`);

      // Listar todos os títulos para debug
      cardsWithCharts.forEach((card, index) => {
        const header = card.querySelector('h3');
        console.log(`Card gráfico ${index}: ${header?.textContent || 'Sem título'}`);
      });

      const chartEntriesExitsCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Entradas e Saídas por Centro de Custo') || text.includes('Entradas e Saídas');
      });
      if (chartEntriesExitsCard) {
        console.log('Encontrado: Gráfico Entradas e Saídas por Centro de Custo');
        await captureAndAdd(chartEntriesExitsCard, 15, 'Gráfico Entradas e Saídas por Centro de Custo');
      } else {
        console.warn('NÃO encontrado: Gráfico Entradas e Saídas por Centro de Custo');
      }

      const chartDifferenceCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Diferença por Centro de Custo') || text.includes('Diferença');
      });
      if (chartDifferenceCard) {
        console.log('Encontrado: Gráfico Diferença por Centro de Custo');
        await captureAndAdd(chartDifferenceCard, 20, 'Gráfico Diferença por Centro de Custo');
      } else {
        console.warn('NÃO encontrado: Gráfico Diferença por Centro de Custo');
      }

      // Tabela Por Natureza (texto)
      checkPageBreak(50);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Por Natureza', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Natureza', margin, yPosition);
      pdf.text('Entradas', margin + 80, yPosition);
      pdf.text('Saídas', margin + 110, yPosition);
      pdf.text('Registros', margin + 140, yPosition);
      yPosition += 7;

      pdf.setFont('helvetica', 'normal');
      const sortedNature = sortArray(
        displayReport.byNature,
        sortNature,
        (item, column) => {
          switch (column) {
            case 'nature': return item.nature || '';
            case 'entries': return item.totalEntries;
            case 'exits': return item.totalExits;
            case 'records': return item.recordCount;
            default: return '';
          }
        }
      );
      sortedNature.slice(0, 10).forEach(item => {
        checkPageBreak(8);
        const nature = (item.nature || 'Não informado').substring(0, 30);
        pdf.text(nature, margin, yPosition);
        pdf.setTextColor(0, 150, 0);
        pdf.text(formatCurrency(item.totalEntries), margin + 80, yPosition);
        pdf.setTextColor(200, 0, 0);
        pdf.text(formatCurrency(item.totalExits), margin + 110, yPosition);
        pdf.setTextColor(0, 0, 0);
        pdf.text(item.recordCount.toString(), margin + 140, yPosition);
        yPosition += 7;
      });
      yPosition += 10;

      // Gráfico Por Natureza (imagem)
      const chartNatureCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Saídas por Natureza') || (text.includes('Natureza') && text.includes('Saídas'));
      });
      if (chartNatureCard) {
        console.log('Encontrado: Gráfico Saídas por Natureza');
        await captureAndAdd(chartNatureCard, 20, 'Gráfico Saídas por Natureza');
      } else {
        console.warn('NÃO encontrado: Gráfico Saídas por Natureza');
      }

      // Gráficos Principais Fornecedores (imagens)
      const chartSuppliersEntriesCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Entradas por Fornecedor') || (text.includes('Fornecedor') && text.includes('Entradas'));
      });
      if (chartSuppliersEntriesCard) {
        console.log('Encontrado: Gráfico Entradas por Fornecedor');
        await captureAndAdd(chartSuppliersEntriesCard, 15, 'Gráfico Entradas por Fornecedor');
      } else {
        console.warn('NÃO encontrado: Gráfico Entradas por Fornecedor');
      }

      const chartSuppliersExitsCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Saídas por Fornecedor') || (text.includes('Fornecedor') && text.includes('Saídas'));
      });
      if (chartSuppliersExitsCard) {
        console.log('Encontrado: Gráfico Saídas por Fornecedor');
        await captureAndAdd(chartSuppliersExitsCard, 20, 'Gráfico Saídas por Fornecedor');
      } else {
        console.warn('NÃO encontrado: Gráfico Saídas por Fornecedor');
      }

      // Tabela Principais Fornecedores (texto)
      checkPageBreak(50);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Principais Fornecedores', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Fornecedor', margin, yPosition);
      pdf.text('Entradas', margin + 70, yPosition);
      pdf.text('Saídas', margin + 100, yPosition);
      pdf.text('Diferença', margin + 130, yPosition);
      yPosition += 7;

      pdf.setFont('helvetica', 'normal');
      const sortedSuppliers = sortArray(
        displayReport.topSuppliers,
        sortSuppliers,
        (item, column) => {
          switch (column) {
            case 'supplier': return item.supplier || '';
            case 'entries': return item.totalEntries;
            case 'exits': return item.totalExits;
            case 'difference': return item.netValue;
            case 'records': return item.recordCount;
            default: return '';
          }
        }
      );
      sortedSuppliers.slice(0, 10).forEach(item => {
        checkPageBreak(8);
        const supplier = (item.supplier || 'Não informado').substring(0, 25);
        pdf.text(supplier, margin, yPosition);
        pdf.setTextColor(0, 150, 0);
        pdf.text(formatCurrency(item.totalEntries), margin + 70, yPosition);
        pdf.setTextColor(200, 0, 0);
        pdf.text(formatCurrency(item.totalExits), margin + 100, yPosition);
        pdf.setTextColor(0, 0, 0);
        const diffColor = item.netValue >= 0 ? [0, 150, 0] : [200, 0, 0];
        pdf.setTextColor(diffColor[0], diffColor[1], diffColor[2]);
        pdf.text(formatCurrency(item.netValue), margin + 130, yPosition);
        pdf.setTextColor(0, 0, 0);
        yPosition += 7;
      });
      yPosition += 10;

      // Gráficos Por Tipo de Documento (imagens)
      const chartDocEntriesCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Entradas por Tipo de Documento') || 
               (text.includes('Tipo de Documento') && text.includes('Entradas'));
      });
      if (chartDocEntriesCard) {
        console.log('Encontrado: Gráfico Entradas por Tipo de Documento');
        await captureAndAdd(chartDocEntriesCard, 15, 'Gráfico Entradas por Tipo de Documento');
      } else {
        console.warn('NÃO encontrado: Gráfico Entradas por Tipo de Documento');
      }

      const chartDocExitsCard = cardsWithCharts.find(card => {
        const header = card.querySelector('h3');
        const text = header?.textContent || '';
        return text.includes('Saídas por Tipo de Documento') || 
               (text.includes('Tipo de Documento') && text.includes('Saídas') && !text.includes('Entradas'));
      });
      if (chartDocExitsCard) {
        console.log('Encontrado: Gráfico Saídas por Tipo de Documento');
        await captureAndAdd(chartDocExitsCard, 20, 'Gráfico Saídas por Tipo de Documento');
      } else {
        console.warn('NÃO encontrado: Gráfico Saídas por Tipo de Documento');
      }

      // Tabela Por Tipo de Documento (texto)
      checkPageBreak(50);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Por Tipo de Documento', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Tipo de Documento', margin, yPosition);
      pdf.text('Entradas', margin + 80, yPosition);
      pdf.text('Saídas', margin + 110, yPosition);
      pdf.text('Registros', margin + 140, yPosition);
      yPosition += 7;

      pdf.setFont('helvetica', 'normal');
      const sortedDocumentType = sortArray(
        displayReport.byDocumentType,
        sortDocumentType,
        (item, column) => {
          switch (column) {
            case 'documentType': return item.documentType || '';
            case 'entries': return item.totalEntries;
            case 'exits': return item.totalExits;
            case 'records': return item.recordCount;
            default: return '';
          }
        }
      );
      sortedDocumentType.slice(0, 10).forEach(item => {
        checkPageBreak(8);
        const docType = (item.documentType || 'Não informado').substring(0, 30);
        pdf.text(docType, margin, yPosition);
        pdf.setTextColor(0, 150, 0);
        pdf.text(formatCurrency(item.totalEntries), margin + 80, yPosition);
        pdf.setTextColor(200, 0, 0);
        pdf.text(formatCurrency(item.totalExits), margin + 110, yPosition);
        pdf.setTextColor(0, 0, 0);
        pdf.text(item.recordCount.toString(), margin + 140, yPosition);
        yPosition += 7;
      });

      // Remover loading
      if (loadingToast && loadingToast.parentNode) {
        document.body.removeChild(loadingToast);
      }

      // Salvar PDF
      const fileName = `analise-financeira-${now.toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      console.log('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Detalhes do erro:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
      
      alert(`Erro ao exportar PDF: ${errorMessage}\n\nVerifique o console do navegador (F12) para mais detalhes.`);
      
      // Remover loading em caso de erro
      const loadingToast = document.querySelector('.fixed.top-4.right-4');
      if (loadingToast && loadingToast.parentNode) {
        document.body.removeChild(loadingToast);
      }
    }
  };

  if (!canAccess) {
    return (
      <ProtectedRoute route="/ponto/financeiro/analise">
        <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
                    Acesso Negado
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Você não tem permissão para acessar esta página. Apenas administradores e membros do departamento financeiro podem acessar.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/financeiro/analise">
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Análise Financeira
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Importe uma planilha financeira e gere relatórios detalhados de análise
            </p>
          </div>

          {/* Upload Section */}
          <Card className="border-2 border-gray-200 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <Upload className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        Análise Financeira
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Importe sua planilha para gerar relatórios detalhados
                      </p>
                    </div>
                  </div>
                </div>

                {/* Upload Area */}
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Selecione o arquivo
                  </label>
                  
                  <label className="block cursor-pointer group">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div className={`
                      relative flex flex-col items-center justify-center 
                      px-8 py-12 border-2 border-dashed rounded-xl
                      transition-all duration-200
                      ${selectedFile 
                        ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/10' 
                        : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 group-hover:border-red-400 dark:group-hover:border-red-500 group-hover:bg-red-50/50 dark:group-hover:bg-red-900/10'
                      }
                    `}>
                      {selectedFile ? (
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                            <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                              {selectedFile.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {(selectedFile.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Clique para trocar o arquivo
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-colors">
                            <Upload className="w-8 h-8 text-gray-400 group-hover:text-red-500 transition-colors" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Clique para selecionar ou arraste o arquivo aqui
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Formatos suportados: .xlsx, .xls, .csv
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3">
                    {displayReport && (
                      <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow-md"
                      >
                        <Download className="w-5 h-5" />
                        <span>Exportar PDF</span>
                      </button>
                    )}
                    <button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploadMutation.isPending}
                      className="flex items-center gap-2 px-8 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md disabled:shadow-none"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-5 h-5" />
                          <span>Importar e Analisar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Status Messages */}
                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-r-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                          Erro ao processar
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {uploadMutation.isSuccess && !error && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-r-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                          Sucesso!
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Planilha processada com sucesso! O relatório foi gerado abaixo.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Report Section */}
          {displayReport && (
            <div id="report-section" className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Total de Registros
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {displayReport.summary.totalRecords.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Total de Entradas
                        </p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(displayReport.summary.totalEntries)}
                        </p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-green-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Total de Saídas
                        </p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(displayReport.summary.totalExits)}
                        </p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-red-400 rotate-180" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Período Analisado
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatDate(displayReport.summary.periodRange.start)}
                          </p>
                          <span className="text-gray-400">→</span>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatDate(displayReport.summary.periodRange.end)}
                          </p>
                        </div>
                      </div>
                      <Calendar className="w-8 h-8 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* By Cost Center */}
              {displayReport.byCostCenter && displayReport.byCostCenter.length > 0 ? (() => {
                const sorted = sortArray(
                  displayReport.byCostCenter,
                  sortCostCenter,
                  (item, column) => {
                    switch (column) {
                      case 'costCenter': return item.costCenter || '';
                      case 'entries': return item.totalEntries;
                      case 'exits': return item.totalExits;
                      case 'records': return item.recordCount;
                      default: return '';
                    }
                  }
                );
                const displayed = sorted.slice(0, 10);
                
                return (
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <BarChart3 className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Por Centro de Custo
                          </h3>
                        </div>
                        {displayReport.byCostCenter.length > 10 && (
                          <button
                            onClick={() => setShowCostCenterModal(true)}
                            className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            Ver mais ({displayReport.byCostCenter.length})
                          </button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              {renderSortableHeaderLeft(
                                'Centro de Custo',
                                'costCenter',
                                sortCostCenter,
                                (col) => setSortCostCenter({ 
                                  column: col as any, 
                                  direction: sortCostCenter.column === col && sortCostCenter.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Entradas',
                                'entries',
                                sortCostCenter,
                                (col) => setSortCostCenter({ 
                                  column: col as any, 
                                  direction: sortCostCenter.column === col && sortCostCenter.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Saídas',
                                'exits',
                                sortCostCenter,
                                (col) => setSortCostCenter({ 
                                  column: col as any, 
                                  direction: sortCostCenter.column === col && sortCostCenter.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Registros',
                                'records',
                                sortCostCenter,
                                (col) => setSortCostCenter({ 
                                  column: col as any, 
                                  direction: sortCostCenter.column === col && sortCostCenter.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {displayed.map((item, index) => (
                            <tr 
                              key={index} 
                              className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                              onClick={() => handleRowClick('costCenter', item.costCenter || 'Não informado', `Registros - Centro de Custo: ${item.costCenter || 'Não informado'}`)}
                            >
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {item.costCenter || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                                {formatCurrency(item.totalEntries)}
                              </td>
                              <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                                {formatCurrency(item.totalExits)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                                {item.recordCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                );
              })() : null}

              {/* Gráficos - Por Centro de Custo */}
              {displayReport.byCostCenter && displayReport.byCostCenter.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gráfico de Entradas e Saídas */}
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Entradas e Saídas por Centro de Custo
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={displayReport.byCostCenter.slice(0, 10).map(item => ({
                            name: item.costCenter || 'Não informado',
                            Entradas: item.totalEntries,
                            Saídas: item.totalExits
                          }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={100}
                            className="text-xs"
                            tick={{ fill: 'currentColor' }}
                          />
                          <YAxis 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => {
                              if (Math.abs(value) >= 1000000) {
                                return `R$ ${(value / 1000000).toFixed(1)}M`;
                              }
                              if (Math.abs(value) >= 1000) {
                                return `R$ ${(value / 1000).toFixed(0)}k`;
                              }
                              return formatCurrency(value);
                            }}
                          />
                          <Tooltip 
                            formatter={(value: number, name: string) => {
                              const color = name === 'Entradas' ? '#10b981' : '#ef4444';
                              return [<span style={{ color }}>{formatCurrency(value)}</span>, name];
                            }}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              color: '#111827'
                            }}
                            labelStyle={{ color: '#111827' }}
                          />
                          <Legend 
                            wrapperStyle={{ color: 'inherit' }}
                            formatter={(value) => {
                              const color = value === 'Entradas' ? '#10b981' : '#ef4444';
                              return <span style={{ color }}>{value}</span>;
                            }}
                          />
                          <Bar dataKey="Entradas" fill="#10b981" name="Entradas" />
                          <Bar dataKey="Saídas" fill="#ef4444" name="Saídas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Gráfico de Diferença */}
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Diferença por Centro de Custo
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={displayReport.byCostCenter.slice(0, 10).map(item => ({
                            name: item.costCenter || 'Não informado',
                            Diferença: item.totalEntries - item.totalExits
                          }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={100}
                            className="text-xs"
                            tick={{ fill: 'currentColor' }}
                          />
                          <YAxis 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => {
                              if (Math.abs(value) >= 1000000) {
                                return `R$ ${(value / 1000000).toFixed(1)}M`;
                              }
                              if (Math.abs(value) >= 1000) {
                                return `R$ ${(value / 1000).toFixed(0)}k`;
                              }
                              return formatCurrency(value);
                            }}
                          />
                          <Tooltip 
                            formatter={(value: number) => {
                              const color = value >= 0 ? '#10b981' : '#ef4444';
                              return [<span style={{ color }}>{formatCurrency(value)}</span>, 'Diferença'];
                            }}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              color: '#111827'
                            }}
                            labelStyle={{ color: '#111827' }}
                          />
                          <Bar dataKey="Diferença" name="Diferença">
                            {displayReport.byCostCenter.slice(0, 10).map((item, index) => {
                              const diferenca = item.totalEntries - item.totalExits;
                              return (
                                <Cell key={`cell-${index}`} fill={diferenca >= 0 ? '#10b981' : '#ef4444'} />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* By Nature */}
              {displayReport.byNature && displayReport.byNature.length > 0 ? (() => {
                const sorted = sortArray(
                  displayReport.byNature,
                  sortNature,
                  (item, column) => {
                    switch (column) {
                      case 'nature': return item.nature || '';
                      case 'entries': return item.totalEntries;
                      case 'exits': return item.totalExits;
                      case 'records': return item.recordCount;
                      default: return '';
                    }
                  }
                );
                const displayed = sorted.slice(0, 10);
                
                return (
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Por Natureza
                          </h3>
                        </div>
                        {displayReport.byNature.length > 10 && (
                          <button
                            onClick={() => setShowNatureModal(true)}
                            className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            Ver mais ({displayReport.byNature.length})
                          </button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              {renderSortableHeaderLeft(
                                'Natureza',
                                'nature',
                                sortNature,
                                (col) => setSortNature({ 
                                  column: col as any, 
                                  direction: sortNature.column === col && sortNature.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Entradas',
                                'entries',
                                sortNature,
                                (col) => setSortNature({ 
                                  column: col as any, 
                                  direction: sortNature.column === col && sortNature.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Saídas',
                                'exits',
                                sortNature,
                                (col) => setSortNature({ 
                                  column: col as any, 
                                  direction: sortNature.column === col && sortNature.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Registros',
                                'records',
                                sortNature,
                                (col) => setSortNature({ 
                                  column: col as any, 
                                  direction: sortNature.column === col && sortNature.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {displayed.map((item, index) => (
                            <tr 
                              key={index} 
                              className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                              onClick={() => handleRowClick('nature', item.nature || 'Não informado', `Registros - Natureza: ${item.nature || 'Não informado'}`)}
                            >
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {item.nature || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                                {formatCurrency(item.totalEntries)}
                              </td>
                              <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                                {formatCurrency(item.totalExits)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                                {item.recordCount}
                              </td>
                            </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })() : null}

              {/* Gráfico - Por Natureza */}
              {displayReport.byNature && displayReport.byNature.length > 0 && (
                <Card>
                  <CardHeader className="border-b-0">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Saídas por Natureza
                      </h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        data={[...displayReport.byNature]
                          .sort((a, b) => b.totalExits - a.totalExits)
                          .slice(0, 10)
                          .map(item => ({
                            name: item.nature || 'Não informado',
                            Saídas: item.totalExits
                          }))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                        <XAxis 
                          dataKey="name" 
                          angle={-45}
                          textAnchor="end"
                          height={100}
                          className="text-xs"
                          tick={{ fill: 'currentColor' }}
                        />
                         <YAxis 
                           tick={{ fill: 'currentColor' }}
                           tickFormatter={(value) => {
                             if (Math.abs(value) >= 1000000) {
                               return `R$ ${(value / 1000000).toFixed(1)}M`;
                             }
                             if (Math.abs(value) >= 1000) {
                               return `R$ ${(value / 1000).toFixed(0)}k`;
                             }
                             return formatCurrency(value);
                           }}
                         />
                         <Tooltip 
                           formatter={(value: number) => {
                             return [<span style={{ color: '#ef4444' }}>{formatCurrency(value)}</span>, 'Saídas'];
                           }}
                           contentStyle={{
                             backgroundColor: '#ffffff',
                             border: '1px solid #e5e7eb',
                             borderRadius: '0.5rem',
                             color: '#111827'
                           }}
                           labelStyle={{ color: '#111827' }}
                         />
                         <Legend 
                           wrapperStyle={{ color: 'inherit' }}
                           formatter={() => <span style={{ color: '#ef4444' }}>Saídas</span>}
                         />
                         <Bar dataKey="Saídas" fill="#ef4444" name="Saídas" />
                       </BarChart>
                     </ResponsiveContainer>
                   </CardContent>
                 </Card>
               )}

               {/* Top Suppliers */}
              {displayReport.topSuppliers && displayReport.topSuppliers.length > 0 ? (() => {
                const sorted = sortArray(
                  displayReport.topSuppliers,
                  sortSuppliers,
                  (item, column) => {
                    switch (column) {
                      case 'supplier': return item.supplier || '';
                      case 'entries': return item.totalEntries;
                      case 'exits': return item.totalExits;
                      case 'difference': return item.netValue;
                      case 'records': return item.recordCount;
                      default: return '';
                    }
                  }
                );
                const displayed = sorted.slice(0, 10);
                
                return (
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Principais Fornecedores
                          </h3>
                        </div>
                        {displayReport.bySupplier && displayReport.bySupplier.length > 10 && (
                          <button
                            onClick={() => setShowSuppliersModal(true)}
                            className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            Ver mais ({displayReport.bySupplier.length})
                          </button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              {renderSortableHeaderLeft(
                                'Fornecedor',
                                'supplier',
                                sortSuppliers,
                                (col) => setSortSuppliers({ 
                                  column: col as any, 
                                  direction: sortSuppliers.column === col && sortSuppliers.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                CPF/CNPJ
                              </th>
                              {renderSortableHeader(
                                'Entradas',
                                'entries',
                                sortSuppliers,
                                (col) => setSortSuppliers({ 
                                  column: col as any, 
                                  direction: sortSuppliers.column === col && sortSuppliers.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Saídas',
                                'exits',
                                sortSuppliers,
                                (col) => setSortSuppliers({ 
                                  column: col as any, 
                                  direction: sortSuppliers.column === col && sortSuppliers.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Diferença',
                                'difference',
                                sortSuppliers,
                                (col) => setSortSuppliers({ 
                                  column: col as any, 
                                  direction: sortSuppliers.column === col && sortSuppliers.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                              {renderSortableHeader(
                                'Registros',
                                'records',
                                sortSuppliers,
                                (col) => setSortSuppliers({ 
                                  column: col as any, 
                                  direction: sortSuppliers.column === col && sortSuppliers.direction === 'desc' ? 'asc' : 'desc' 
                                })
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {displayed.map((item, index) => (
                            <tr 
                              key={index} 
                              className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                              onClick={() => handleRowClick('supplier', item.supplier || 'Não informado', `Registros - Fornecedor: ${item.supplier || 'Não informado'}`)}
                            >
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {item.supplier || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {item.cpfCnpj || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                                {formatCurrency(item.totalEntries)}
                              </td>
                              <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                                {formatCurrency(item.totalExits)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-medium ${
                                item.netValue >= 0 
                                  ? 'text-green-600 dark:text-green-400' 
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {formatCurrency(item.netValue)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                                {item.recordCount}
                              </td>
                            </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })() : null}

              {/* Gráficos - Principais Fornecedores */}
              {displayReport.topSuppliers && displayReport.topSuppliers.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gráfico de Entradas */}
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Entradas por Fornecedor
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={[...displayReport.topSuppliers]
                            .sort((a, b) => b.totalEntries - a.totalEntries)
                            .slice(0, 10)
                            .map(item => ({
                              name: (item.supplier || 'Não informado').substring(0, 20),
                              Entradas: item.totalEntries
                            }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={100}
                            className="text-xs"
                            tick={{ fill: 'currentColor' }}
                          />
                          <YAxis 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => {
                              if (Math.abs(value) >= 1000000) {
                                return `R$ ${(value / 1000000).toFixed(1)}M`;
                              }
                              if (Math.abs(value) >= 1000) {
                                return `R$ ${(value / 1000).toFixed(0)}k`;
                              }
                              return formatCurrency(value);
                            }}
                          />
                          <Tooltip 
                            formatter={(value: number) => {
                              return [<span style={{ color: '#10b981' }}>{formatCurrency(value)}</span>, 'Entradas'];
                            }}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              color: '#111827'
                            }}
                            labelStyle={{ color: '#111827' }}
                          />
                          <Legend 
                            wrapperStyle={{ color: 'inherit' }}
                            formatter={() => <span style={{ color: '#10b981' }}>Entradas</span>}
                          />
                          <Bar dataKey="Entradas" fill="#10b981" name="Entradas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Gráfico de Saídas */}
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Saídas por Fornecedor
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={[...displayReport.topSuppliers]
                            .sort((a, b) => b.totalExits - a.totalExits)
                            .slice(0, 10)
                            .map(item => ({
                              name: (item.supplier || 'Não informado').substring(0, 20),
                              Saídas: item.totalExits
                            }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={100}
                            className="text-xs"
                            tick={{ fill: 'currentColor' }}
                          />
                          <YAxis 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => {
                              if (Math.abs(value) >= 1000000) {
                                return `R$ ${(value / 1000000).toFixed(1)}M`;
                              }
                              if (Math.abs(value) >= 1000) {
                                return `R$ ${(value / 1000).toFixed(0)}k`;
                              }
                              return formatCurrency(value);
                            }}
                          />
                          <Tooltip 
                            formatter={(value: number) => {
                              return [<span style={{ color: '#ef4444' }}>{formatCurrency(value)}</span>, 'Saídas'];
                            }}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              color: '#111827'
                            }}
                            labelStyle={{ color: '#111827' }}
                          />
                          <Legend 
                            wrapperStyle={{ color: 'inherit' }}
                            formatter={() => <span style={{ color: '#ef4444' }}>Saídas</span>}
                          />
                          <Bar dataKey="Saídas" fill="#ef4444" name="Saídas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* By Document Type */}
              {displayReport.byDocumentType && displayReport.byDocumentType.length > 0 && (
                <Card>
                  <CardHeader className="border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Por Tipo de Documento
                        </h3>
                      </div>
                      {displayReport.byDocumentType.length > 10 && (
                        <button
                          onClick={() => setShowDocumentTypeModal(true)}
                          className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          Ver mais ({displayReport.byDocumentType.length})
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            {renderSortableHeaderLeft(
                              'Tipo de Documento',
                              'documentType',
                              sortDocumentType,
                              (col) => setSortDocumentType({ 
                                column: col as any, 
                                direction: sortDocumentType.column === col && sortDocumentType.direction === 'desc' ? 'asc' : 'desc' 
                              })
                            )}
                            {renderSortableHeader(
                              'Entradas',
                              'entries',
                              sortDocumentType,
                              (col) => setSortDocumentType({ 
                                column: col as any, 
                                direction: sortDocumentType.column === col && sortDocumentType.direction === 'desc' ? 'asc' : 'desc' 
                              })
                            )}
                            {renderSortableHeader(
                              'Saídas',
                              'exits',
                              sortDocumentType,
                              (col) => setSortDocumentType({ 
                                column: col as any, 
                                direction: sortDocumentType.column === col && sortDocumentType.direction === 'desc' ? 'asc' : 'desc' 
                              })
                            )}
                            {renderSortableHeader(
                              'Registros',
                              'records',
                              sortDocumentType,
                              (col) => setSortDocumentType({ 
                                column: col as any, 
                                direction: sortDocumentType.column === col && sortDocumentType.direction === 'desc' ? 'asc' : 'desc' 
                              })
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                          {(() => {
                            const sorted = sortArray(
                              displayReport.byDocumentType,
                              sortDocumentType,
                              (item, column) => {
                                switch (column) {
                                  case 'documentType': return item.documentType || '';
                                  case 'entries': return item.totalEntries;
                                  case 'exits': return item.totalExits;
                                  case 'records': return item.recordCount;
                                  default: return '';
                                }
                              }
                            );
                            return sorted.slice(0, 10).map((item, index) => (
                              <tr 
                                key={index} 
                                className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                                onClick={() => handleRowClick('documentType', item.documentType || 'Não informado', `Registros - Tipo de Documento: ${item.documentType || 'Não informado'}`)}
                              >
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {item.documentType || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                                  {formatCurrency(item.totalEntries)}
                                </td>
                                <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                                  {formatCurrency(item.totalExits)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                                  {item.recordCount}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Gráficos - Por Tipo de Documento */}
              {displayReport.byDocumentType && displayReport.byDocumentType.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gráfico de Pizza - Entradas */}
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Entradas por Tipo de Documento
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <PieChart>
                          <Pie
                            data={(() => {
                              // Ordenar por valor e agrupar valores pequenos em "Outros"
                              const sorted = [...displayReport.byDocumentType]
                                .sort((a, b) => b.totalEntries - a.totalEntries);
                              
                              const total = sorted.reduce((sum, item) => sum + item.totalEntries, 0);
                              const threshold = total * 0.02; // 2% do total
                              
                              const mainItems = sorted.filter(item => item.totalEntries >= threshold);
                              const othersItems = sorted.filter(item => item.totalEntries < threshold);
                              
                              const othersTotal = othersItems.reduce((sum, item) => sum + item.totalEntries, 0);
                              
                              const chartData = mainItems.map(item => ({
                                name: item.documentType || 'Não informado',
                                value: item.totalEntries
                              }));
                              
                              if (othersTotal > 0) {
                                chartData.push({
                                  name: 'Outros',
                                  value: othersTotal
                                });
                              }
                              
                              return chartData;
                            })()}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }: any) => {
                              // Mostrar label apenas se for maior que 3%
                              if (percent >= 0.03) {
                                return `${name}: ${(percent * 100).toFixed(1)}%`;
                              }
                              return '';
                            }}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {(() => {
                              const sorted = [...displayReport.byDocumentType]
                                .sort((a, b) => b.totalEntries - a.totalEntries);
                              
                              const total = sorted.reduce((sum, item) => sum + item.totalEntries, 0);
                              const threshold = total * 0.02;
                              
                              const mainItems = sorted.filter(item => item.totalEntries >= threshold);
                              const othersItems = sorted.filter(item => item.totalEntries < threshold);
                              
                              const colors = [
                                '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', 
                                '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
                                '#f97316', '#6366f1', '#14b8a6', '#a855f7',
                                '#64748b', '#f43f5e', '#0ea5e9', '#a3e635'
                              ];
                              
                              return [
                                ...mainItems.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                )),
                                ...(othersItems.length > 0 ? [<Cell key="cell-others" fill="#94a3b8" />] : [])
                              ];
                            })()}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => {
                              return [<span style={{ color: '#10b981' }}>{formatCurrency(value)}</span>, 'Entradas'];
                            }}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              color: '#111827'
                            }}
                            labelStyle={{ color: '#111827' }}
                          />
                          <Legend 
                            wrapperStyle={{ paddingTop: '20px', color: 'inherit' }}
                            formatter={(value) => {
                              // Recriar a mesma lógica de cores do gráfico
                              const sorted = [...displayReport.byDocumentType]
                                .sort((a, b) => b.totalEntries - a.totalEntries);
                              
                              const total = sorted.reduce((sum, item) => sum + item.totalEntries, 0);
                              const threshold = total * 0.02;
                              
                              const mainItems = sorted.filter(item => item.totalEntries >= threshold);
                              const othersItems = sorted.filter(item => item.totalEntries < threshold);
                              
                              const colors = [
                                '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', 
                                '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
                                '#f97316', '#6366f1', '#14b8a6', '#a855f7',
                                '#64748b', '#f43f5e', '#0ea5e9', '#a3e635'
                              ];
                              
                              // Encontrar a cor correspondente
                              let color = '#94a3b8'; // Cor padrão para "Outros"
                              
                              if (value === 'Outros') {
                                color = '#94a3b8';
                              } else {
                                const mainIndex = mainItems.findIndex(item => item.documentType === value);
                                if (mainIndex !== -1) {
                                  color = colors[mainIndex % colors.length];
                                }
                              }
                              
                              const item = displayReport.byDocumentType.find(d => d.documentType === value);
                              const percent = item ? (item.totalEntries / displayReport.byDocumentType.reduce((sum, d) => sum + d.totalEntries, 0)) * 100 : 0;
                              
                              return <span style={{ color }}>{`${value} (${percent.toFixed(1)}%)`}</span>;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Gráfico de Barra - Saídas */}
                  <Card>
                    <CardHeader className="border-b-0">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Saídas por Tipo de Documento
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={[...displayReport.byDocumentType]
                            .sort((a, b) => b.totalExits - a.totalExits)
                            .slice(0, 10)
                            .map(item => ({
                              name: item.documentType || 'Não informado',
                              Saídas: item.totalExits
                            }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={100}
                            className="text-xs"
                            tick={{ fill: 'currentColor' }}
                          />
                          <YAxis 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => {
                              if (Math.abs(value) >= 1000000) {
                                return `R$ ${(value / 1000000).toFixed(1)}M`;
                              }
                              if (Math.abs(value) >= 1000) {
                                return `R$ ${(value / 1000).toFixed(0)}k`;
                              }
                              return formatCurrency(value);
                            }}
                          />
                          <Tooltip 
                            formatter={(value: number) => {
                              return [<span style={{ color: '#ef4444' }}>{formatCurrency(value)}</span>, 'Saídas'];
                            }}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              color: '#111827'
                            }}
                            labelStyle={{ color: '#111827' }}
                          />
                          <Legend 
                            wrapperStyle={{ color: 'inherit' }}
                            formatter={() => <span style={{ color: '#ef4444' }}>Saídas</span>}
                          />
                          <Bar dataKey="Saídas" fill="#ef4444" name="Saídas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Modais com listas completas */}
          {/* Modal - Por Centro de Custo */}
          <Modal
            isOpen={showCostCenterModal}
            onClose={() => setShowCostCenterModal(false)}
            title="Por Centro de Custo - Lista Completa"
            size="xl"
          >
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    {renderSortableHeaderLeft(
                      'Centro de Custo',
                      'costCenter',
                      sortCostCenterModal,
                      (col) => setSortCostCenterModal({ 
                        column: col as any, 
                        direction: sortCostCenterModal.column === col && sortCostCenterModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Entradas',
                      'entries',
                      sortCostCenterModal,
                      (col) => setSortCostCenterModal({ 
                        column: col as any, 
                        direction: sortCostCenterModal.column === col && sortCostCenterModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Saídas',
                      'exits',
                      sortCostCenterModal,
                      (col) => setSortCostCenterModal({ 
                        column: col as any, 
                        direction: sortCostCenterModal.column === col && sortCostCenterModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Registros',
                      'records',
                      sortCostCenterModal,
                      (col) => setSortCostCenterModal({ 
                        column: col as any, 
                        direction: sortCostCenterModal.column === col && sortCostCenterModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortArray(
                    displayReport?.byCostCenter || [],
                    sortCostCenterModal,
                    (item, column) => {
                      switch (column) {
                        case 'costCenter': return item.costCenter || '';
                        case 'entries': return item.totalEntries;
                        case 'exits': return item.totalExits;
                        case 'records': return item.recordCount;
                        default: return '';
                      }
                    }
                  ).map((item, index) => (
                    <tr 
                      key={index} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      onClick={() => handleRowClick('costCenter', item.costCenter || 'Não informado', `Registros - Centro de Custo: ${item.costCenter || 'Não informado'}`)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {item.costCenter || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                        {formatCurrency(item.totalEntries)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                        {formatCurrency(item.totalExits)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                        {item.recordCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>

          {/* Modal - Por Natureza */}
          <Modal
            isOpen={showNatureModal}
            onClose={() => setShowNatureModal(false)}
            title="Por Natureza - Lista Completa"
            size="xl"
          >
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    {renderSortableHeaderLeft(
                      'Natureza',
                      'nature',
                      sortNatureModal,
                      (col) => setSortNatureModal({ 
                        column: col as any, 
                        direction: sortNatureModal.column === col && sortNatureModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Entradas',
                      'entries',
                      sortNatureModal,
                      (col) => setSortNatureModal({ 
                        column: col as any, 
                        direction: sortNatureModal.column === col && sortNatureModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Saídas',
                      'exits',
                      sortNatureModal,
                      (col) => setSortNatureModal({ 
                        column: col as any, 
                        direction: sortNatureModal.column === col && sortNatureModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Registros',
                      'records',
                      sortNatureModal,
                      (col) => setSortNatureModal({ 
                        column: col as any, 
                        direction: sortNatureModal.column === col && sortNatureModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortArray(
                    displayReport?.byNature || [],
                    sortNatureModal,
                    (item, column) => {
                      switch (column) {
                        case 'nature': return item.nature || '';
                        case 'entries': return item.totalEntries;
                        case 'exits': return item.totalExits;
                        case 'records': return item.recordCount;
                        default: return '';
                      }
                    }
                  ).map((item, index) => (
                    <tr 
                      key={index} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      onClick={() => handleRowClick('nature', item.nature || 'Não informado', `Registros - Natureza: ${item.nature || 'Não informado'}`)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {item.nature || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                        {formatCurrency(item.totalEntries)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                        {formatCurrency(item.totalExits)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                        {item.recordCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>

          {/* Modal - Principais Fornecedores */}
          <Modal
            isOpen={showSuppliersModal}
            onClose={() => setShowSuppliersModal(false)}
            title="Principais Fornecedores - Lista Completa"
            size="xl"
          >
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    {renderSortableHeaderLeft(
                      'Fornecedor',
                      'supplier',
                      sortSuppliersModal,
                      (col) => setSortSuppliersModal({ 
                        column: col as any, 
                        direction: sortSuppliersModal.column === col && sortSuppliersModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      CPF/CNPJ
                    </th>
                    {renderSortableHeader(
                      'Entradas',
                      'entries',
                      sortSuppliersModal,
                      (col) => setSortSuppliersModal({ 
                        column: col as any, 
                        direction: sortSuppliersModal.column === col && sortSuppliersModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Saídas',
                      'exits',
                      sortSuppliersModal,
                      (col) => setSortSuppliersModal({ 
                        column: col as any, 
                        direction: sortSuppliersModal.column === col && sortSuppliersModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Diferença',
                      'difference',
                      sortSuppliersModal,
                      (col) => setSortSuppliersModal({ 
                        column: col as any, 
                        direction: sortSuppliersModal.column === col && sortSuppliersModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Registros',
                      'records',
                      sortSuppliersModal,
                      (col) => setSortSuppliersModal({ 
                        column: col as any, 
                        direction: sortSuppliersModal.column === col && sortSuppliersModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortArray(
                    displayReport?.bySupplier || [],
                    sortSuppliersModal,
                    (item, column) => {
                      switch (column) {
                        case 'supplier': return item.supplier || '';
                        case 'entries': return item.totalEntries;
                        case 'exits': return item.totalExits;
                        case 'difference': return item.totalEntries - item.totalExits;
                        case 'records': return item.recordCount;
                        default: return '';
                      }
                    }
                  ).map((item, index) => {
                    const netValue = item.totalEntries - item.totalExits;
                    return (
                      <tr 
                        key={index} 
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                        onClick={() => handleRowClick('supplier', item.supplier || 'Não informado', `Registros - Fornecedor: ${item.supplier || 'Não informado'}`)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {item.supplier || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {item.cpfCnpj || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                          {formatCurrency(item.totalEntries)}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                          {formatCurrency(item.totalExits)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${
                          netValue >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(netValue)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                          {item.recordCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Modal>

          {/* Modal - Por Tipo de Documento */}
          <Modal
            isOpen={showDocumentTypeModal}
            onClose={() => setShowDocumentTypeModal(false)}
            title="Por Tipo de Documento - Lista Completa"
            size="xl"
          >
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    {renderSortableHeaderLeft(
                      'Tipo de Documento',
                      'documentType',
                      sortDocumentTypeModal,
                      (col) => setSortDocumentTypeModal({ 
                        column: col as any, 
                        direction: sortDocumentTypeModal.column === col && sortDocumentTypeModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Entradas',
                      'entries',
                      sortDocumentTypeModal,
                      (col) => setSortDocumentTypeModal({ 
                        column: col as any, 
                        direction: sortDocumentTypeModal.column === col && sortDocumentTypeModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Saídas',
                      'exits',
                      sortDocumentTypeModal,
                      (col) => setSortDocumentTypeModal({ 
                        column: col as any, 
                        direction: sortDocumentTypeModal.column === col && sortDocumentTypeModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                    {renderSortableHeader(
                      'Registros',
                      'records',
                      sortDocumentTypeModal,
                      (col) => setSortDocumentTypeModal({ 
                        column: col as any, 
                        direction: sortDocumentTypeModal.column === col && sortDocumentTypeModal.direction === 'desc' ? 'asc' : 'desc' 
                      })
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortArray(
                    displayReport?.byDocumentType || [],
                    sortDocumentTypeModal,
                    (item, column) => {
                      switch (column) {
                        case 'documentType': return item.documentType || '';
                        case 'entries': return item.totalEntries;
                        case 'exits': return item.totalExits;
                        case 'records': return item.recordCount;
                        default: return '';
                      }
                    }
                  ).map((item, index) => (
                    <tr 
                      key={index} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      onClick={() => handleRowClick('documentType', item.documentType || 'Não informado', `Registros - Tipo de Documento: ${item.documentType || 'Não informado'}`)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {item.documentType || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                        {formatCurrency(item.totalEntries)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                        {formatCurrency(item.totalExits)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                        {item.recordCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>

          {/* Modal - Registros Detalhados */}
          <Modal
            isOpen={showRecordsModal}
            onClose={() => {
              if (previousModal) {
                // Se veio de um modal "Ver mais", volta para ele
                handleBackToPreviousModal();
              } else {
                // Se veio da tabela principal, fecha tudo
                setShowRecordsModal(false);
                setPreviousModal(null);
              }
            }}
            title={selectedRecordTitle}
            size="xl"
          >
            <div className="overflow-x-auto max-h-[70vh]">
              {selectedRecords && selectedRecords.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Data Criação
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Nº Documento
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Descrição
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Entrada
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Saída
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Valor Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Histórico
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {selectedRecords.map((record, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {formatDate(record.datacriacao)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {record.numerodocumento || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {record.descricao || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                          {formatCurrency(record.entrada)}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">
                          {formatCurrency(record.saida)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                          {formatCurrency(record.valortotal)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {record.historico || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Nenhum registro encontrado.
                </div>
              )}
            </div>
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

