'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import {
  ArrowLeft,
  Download,
  Plus,
  Upload,
  ImagePlus,
  X,
  Save,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardHeader } from '@/components/ui/Card';
import toast from 'react-hot-toast';
import api from '@/lib/api';

/* ──────────────────────────────────────────── tipos ── */
interface FotoItem {
  id: string;
  src: string | null;
  titulo: string;
  desc: string;
}

interface CamposData {
  contrato: string;
  os: string;
  unidade: string;
  tipo: string;
  solicitante: string;
  os2: string;
  lote: string;
}

interface RelatorioData {
  campos: CamposData;
  logo: string | null;
  croqui: string | null;
  localizacao: string | null;
  fotos: FotoItem[];
}

interface Contract {
  id: string;
  name: string;
  number: string;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FOTOS_POR_PAGINA = 6;

const inputFotoClasse =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ' +
  'placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500/60 ' +
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500';

export default function RelatorioFotograficoEditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const rawId = params?.id;
  const rawRelId = params?.relatorioId;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';
  const relatorioId = typeof rawRelId === 'string' ? rawRelId : Array.isArray(rawRelId) ? rawRelId[0] ?? '' : '';

  const [campos, setCampos] = useState<CamposData>({
    contrato: 'XXXXXXXX',
    os: 'XXXXXXXXX',
    unidade: 'XXXXXXXXXX',
    tipo: 'XXXXXXXXXX',
    solicitante: 'XXXXXXX',
    os2: 'XXX',
    lote: 'XXX',
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [croqui, setCroqui] = useState<string | null>(null);
  const [localizacao, setLocalizacao] = useState<string | null>(null);
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const inputLoteFotosRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'relatorio-print-css';
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 0 0 18mm 0; }
        /* Não ocultar todos os filhos do body: isso escondia também o próprio relatório
           por ele estar dentro da árvore principal da página, gerando preview em branco. */
        #relatorio-print-root { display: block !important; }
        .relatorio-page-header { display: none !important; }
        .relatorio-toolbar { display: none !important; }
        .relatorio-add-foto-btn { display: none !important; }
        .relatorio-add-foto-slot { display: none !important; }
        .relatorio-foto-remover { display: none !important; }
        .relatorio-bloco-remover { display: none !important; }
        .relatorio-logo-remover { display: none !important; }
        .relatorio-capa { padding: 6mm 10mm 4mm !important; margin: 0 !important; width: 100% !important;
          print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        .relatorio-primeira-folha { width: auto !important; margin: 0 10mm !important; padding: 4mm 0 6mm !important;
          border: none !important; border-radius: 0 !important; page-break-after: always !important; }
        .relatorio-primeira-folha--empty { display: none !important; }
        .relatorio-grupo-pagina { page-break-before: always !important; padding: 20mm 10mm 0 !important; }
        .relatorio-grupo-pagina--first { page-break-before: auto !important; }
        .relatorio-grade { gap: 4mm 4mm !important; grid-template-columns: 1fr 1fr !important; }
        .relatorio-foto-card { page-break-inside: avoid !important; border: 1px solid #bbb !important; border-radius: 0 !important; }
        .relatorio-foto-area { height: 48mm !important; aspect-ratio: unset !important; }
        .relatorio-bloco-img-area { height: 55mm !important; }
        .relatorio-placeholder { display: none !important; }
        .relatorio-numero-foto { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        input[type="file"] { display: none !important; }
        .relatorio-foto-input { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById('relatorio-print-css')?.remove();
    };
  }, []);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });
  const contract = contractData?.data as Contract | undefined;

  const { data: relatorioResponse, isLoading: loadingRelatorio } = useQuery({
    queryKey: ['relatorio-fotografico', contractId, relatorioId],
    queryFn: async () => {
      const res = await api.get(`/relatorios-fotograficos/${contractId}/${relatorioId}`);
      return res.data;
    },
    enabled: !!contractId && !!relatorioId,
  } as Parameters<typeof useQuery>[0]);

  useEffect(() => {
    const d = (relatorioResponse as { data?: RelatorioData } | undefined)?.data;
    if (!d) return;
    if (d.campos) setCampos(d.campos);
    setLogo(d.logo ?? null);
    setCroqui(d.croqui ?? null);
    setLocalizacao(d.localizacao ?? null);
    setFotos(Array.isArray(d.fotos) ? d.fotos : []);
    setDirty(false);
  }, [relatorioResponse]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data: RelatorioData = { campos, logo, croqui, localizacao, fotos };
      await api.put(`/relatorios-fotograficos/${contractId}/${relatorioId}`, { data });
    },
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['relatorio-fotografico', contractId, relatorioId] });
      await queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos', contractId] });
      toast.success('Relatório salvo!');
    },
    onError: () => {
      toast.error('Erro ao salvar.');
    },
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate();
  }, [saveMutation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  const mark = () => setDirty(true);

  const setCampo = (key: keyof CamposData, val: string) => {
    setCampos((prev) => ({ ...prev, [key]: val }));
    mark();
  };

  const adicionarFoto = () => {
    setFotos((prev) => [...prev, { id: uid(), src: null, titulo: '', desc: '' }]);
    mark();
  };

  const removerFoto = (id: string) => {
    setFotos((prev) => prev.filter((f) => f.id !== id));
    mark();
  };

  const setFotoSrc = async (id: string, file: File) => {
    const src = await fileToBase64(file);
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, src } : f)));
    mark();
  };

  const clearFotoSrc = (id: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, src: null } : f)));
    mark();
  };

  const setFotoTitulo = (id: string, titulo: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, titulo } : f)));
    mark();
  };

  const setFotoDesc = (id: string, desc: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, desc } : f)));
    mark();
  };

  const handleLoteFotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const novas: FotoItem[] = await Promise.all(
      arr.map(async (file) => ({
        id: uid(),
        src: await fileToBase64(file),
        titulo: '',
        desc: '',
      }))
    );
    setFotos((prev) => [...prev, ...novas]);
    mark();
  };

  const handleImgChange = async (file: File | undefined, setter: (v: string | null) => void) => {
    if (!file) return;
    const src = await fileToBase64(file);
    setter(src);
    mark();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const exportarPdfDireto = useCallback(async () => {
    const hasCover = !!croqui || !!localizacao;
    const fotosValidas = fotos.filter((f) => !!f.src);
    if (!hasCover && fotosValidas.length === 0) {
      toast.error('Não há conteúdo para exportar.');
      return;
    }

    setIsExportingPdf(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const drawImageContained = (src: string, x: number, y: number, w: number, h: number) => {
        const img = new Image();
        img.src = src;
        const iw = img.width || 1;
        const ih = img.height || 1;
        const ratio = Math.min(w / iw, h / ih);
        const rw = iw * ratio;
        const rh = ih * ratio;
        const rx = x + (w - rw) / 2;
        const ry = y + (h - rh) / 2;
        const format = src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(src, format, rx, ry, rw, rh);
      };

      const generatedAt = new Date();
      const generatedAtLabel = generatedAt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const headerTitleH = 8;
      const headerMetaH = 5;
      const headerTotalH = headerTitleH + headerMetaH;

      const drawHeader = () => {
        // Barra principal do título
        pdf.setFillColor(185, 28, 28);
        pdf.rect(margin, margin, contentW, headerTitleH, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text('RELATORIO FOTOGRAFICO', margin + contentW / 2, margin + 5.3, { align: 'center' });
        pdf.setTextColor(30, 30, 30);
      };

      const drawCoverBlock = (title: string, src: string | null, y: number, h: number) => {
        pdf.setDrawColor(200, 200, 200);
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, y, contentW, 7, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.text(title, margin + contentW / 2, y + 4.5, { align: 'center' });
        pdf.setDrawColor(220, 220, 220);
        pdf.rect(margin, y + 7, contentW, h - 7, 'S');
        if (src) {
          drawImageContained(src, margin + 3, y + 10, contentW - 6, h - 13);
        }
      };

      const drawDadosRelatorioPage = () => {
        drawHeader();
        const sectionTop = margin + headerTitleH + 5;
        const sectionHeaderH = 7;
        pdf.setDrawColor(200, 200, 200);
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, sectionTop, contentW, sectionHeaderH, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(65, 65, 65);
        pdf.text('DADOS DO RELATORIO', margin + contentW / 2, sectionTop + 4.5, { align: 'center' });

        const rows: Array<{ label: string; value: string }> = [
          { label: 'Contrato', value: campos.contrato?.trim() || '' },
          { label: 'Ordem de Servico', value: campos.os?.trim() || '' },
          { label: 'Unidade', value: campos.unidade?.trim() || '' },
          { label: 'Tipo', value: campos.tipo?.trim() || '' },
          { label: 'Solicitante', value: campos.solicitante?.trim() || '' },
          { label: 'OS Secundaria', value: campos.os2?.trim() || '' },
          { label: 'Lote', value: campos.lote?.trim() || '' },
        ].filter((row) => row.value.length > 0);

        let y = sectionTop + sectionHeaderH;
        const rowH = 9;
        const labelW = 44;
        const valueW = contentW - labelW;
        rows.forEach((r) => {
          pdf.setDrawColor(220, 220, 220);
          pdf.setFillColor(248, 248, 248);
          pdf.rect(margin, y, labelW, rowH, 'FD');
          pdf.setFillColor(255, 255, 255);
          pdf.rect(margin + labelW, y, valueW, rowH, 'FD');

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(90, 90, 90);
          pdf.text(r.label, margin + 2, y + 5.7);

          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(35, 35, 35);
          const line = pdf.splitTextToSize(r.value, valueW - 4).slice(0, 1);
          pdf.text(line, margin + labelW + 2, y + 5.7);
          y += rowH;
        });

        // Croqui + localização também na primeira página (abaixo dos dados).
        if (hasCover) {
          const coverStartY = y + 4;
          const available = pageH - margin - coverStartY;
          const coverGap = 3;
          const blockH = Math.max(36, Math.min(72, (available - coverGap) / 2));
          drawCoverBlock('CROQUI DA UNIDADE', croqui, coverStartY, blockH);
          drawCoverBlock('LOCALIZACAO', localizacao, coverStartY + blockH + coverGap, blockH);
        }
      };

      // Página 1: sempre com os dados do relatório
      drawDadosRelatorioPage();

      if (fotosValidas.length > 0) {
        const porPagina = 6;
        const gap = 4;
        const colW = (contentW - gap) / 2;
        const startY = margin + headerTotalH + 6;
        const headerH = 6;
        const imgH = 48;
        const titleBoxH = 7.2;
        const descBoxH = 12;
        const cardH = headerH + imgH + titleBoxH + descBoxH;

        for (let i = 0; i < fotosValidas.length; i += porPagina) {
          pdf.addPage();
          drawHeader();
          const pagina = fotosValidas.slice(i, i + porPagina);
          pagina.forEach((foto, idx) => {
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            const x = margin + col * (colW + gap);
            const y = startY + row * (cardH + gap);
            const blockBottom = y + cardH;

            // Bloco único com bordas retas
            pdf.setDrawColor(210, 210, 210);
            pdf.rect(x, y, colW, cardH, 'S');

            // Faixa do título da foto no mesmo estilo do "CROQUI DA UNIDADE"
            // (cinza claro + texto escuro), mantendo bordas retas.
            pdf.setDrawColor(210, 210, 210);
            pdf.setFillColor(245, 245, 245);
            pdf.rect(x, y, colW, headerH, 'FD');
            pdf.setTextColor(55, 55, 55);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.text(`FOTO ${String(i + idx + 1).padStart(2, '0')}`, x + colW / 2, y + 3.95, { align: 'center' });
            pdf.setTextColor(30, 30, 30);

            // Separadores internos (sem gaps entre seções)
            const imgTop = y + headerH;
            const titleTop = imgTop + imgH;
            const descTop = titleTop + titleBoxH;
            pdf.setDrawColor(210, 210, 210);
            pdf.line(x, imgTop, x + colW, imgTop);
            pdf.line(x, titleTop, x + colW, titleTop);
            pdf.line(x, descTop, x + colW, descTop);

            drawImageContained(foto.src!, x + 1.5, imgTop + 1.5, colW - 3, imgH - 3);

            const txtY = titleTop;
            const titulo = (foto.titulo || '').trim();
            const desc = (foto.desc || '').trim();
            const boxPadX = 2;
            const boxW = colW;
            const titleLabelX = x + boxPadX;
            const descLabelX = x + boxPadX;
            const labelGap = 1.2;

            // Título (dentro do bloco único)
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 120);
            const titleLabel = 'Título:';
            const titleValueX = titleLabelX + pdf.getTextWidth(titleLabel) + labelGap;
            pdf.text(titleLabel, titleLabelX, txtY + 4.6);
            pdf.setTextColor(30, 30, 30);
            pdf.setFont('helvetica', 'normal');
            if (titulo) {
              const tituloOneLine = pdf
                .splitTextToSize(titulo, boxW - (titleValueX - x) - boxPadX)
                .slice(0, 1);
              pdf.text(tituloOneLine, titleValueX, txtY + 4.6);
            }

            // Descrição (dentro do bloco único)
            const descY = txtY + titleBoxH;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 120);
            const descLabel = 'Descrição:';
            const descValueX = descLabelX + pdf.getTextWidth(descLabel) + labelGap;
            pdf.text(descLabel, descLabelX, descY + 4.5);
            pdf.setTextColor(30, 30, 30);
            pdf.setFont('helvetica', 'normal');
            if (desc) {
              const descLines = pdf
                .splitTextToSize(desc, boxW - (descValueX - x) - boxPadX)
                .slice(0, 2);
              pdf.text(descLines, descValueX, descY + 4.5);
            }
          });
        }
      }

      // Rodapé institucional com paginação em todas as páginas
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.2);
        pdf.setTextColor(120, 120, 120);
        pdf.text('Relatório Fotográfico', margin, pageH - 5.3);
        pdf.text(`Página ${p} de ${totalPages}`, margin + contentW, pageH - 5.3, { align: 'right' });
      }

      const safeContract = (contract?.name || 'Relatorio').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Relatorio_Fotografico_${safeContract}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Falha ao exportar PDF do relatório:', error);
      toast.error('Não foi possível exportar o PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [contract?.name, croqui, localizacao, fotos]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (!contractId || !relatorioId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const gruposPagina: FotoItem[][] = [];
  if (!loadingRelatorio) {
    for (let i = 0; i < fotos.length; i += FOTOS_POR_PAGINA) {
      gruposPagina.push(fotos.slice(i, i + FOTOS_POR_PAGINA));
    }
  }
  const gruposRender: { fotos: FotoItem[]; showAddSlot: boolean }[] = gruposPagina.map((grupo) => ({
    fotos: grupo,
    showAddSlot: false,
  }));
  const hasCoverContent = !!croqui || !!localizacao;
  if (gruposRender.length === 0) {
    gruposRender.push({ fotos: [], showAddSlot: true });
  } else if (fotos.length % FOTOS_POR_PAGINA === 0) {
    gruposRender.push({ fotos: [], showAddSlot: true });
  } else {
    gruposRender[gruposRender.length - 1].showAddSlot = true;
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <div className="w-full min-w-0 max-w-[100%] space-y-6 pb-8">
            {/* Cabeçalho: mesmo padrão de OrcamentoPageView (sem ícone, só título + subtítulo) */}
            <div className="relatorio-page-header relative flex min-h-[3.25rem] items-center justify-center py-1">
              <Link
                href={`/ponto/contratos/${contractId}/relatorios`}
                aria-label="Voltar à lista de relatórios"
                className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Voltar
              </Link>
              <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
                  {loadingContract ? 'Carregando contrato…' : contract?.name || 'Relatórios'}
                </h1>
                <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 line-clamp-2 break-words">
                  Relatórios Fotográficos
                </p>
              </div>
            </div>

            {loadingRelatorio ? (
              <Loading message="Carregando relatório…" size="lg" />
            ) : (
              <>
            {/* Toolbar — bloco separado do documento abaixo */}
            <Card padding="none" className="relatorio-toolbar w-full shadow-sm">
              <CardHeader className="p-4 sm:p-5 border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Editor de relatório</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saveMutation.isPending || !dirty}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
                      title={dirty ? 'Salvar alterações' : 'Sem alterações pendentes'}
                    >
                      <Save className="h-4 w-4 shrink-0" />
                      {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                    <label className="relatorio-add-foto-btn inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                      <Upload className="h-4 w-4 shrink-0" />
                      Fotos em lote
                      <input ref={inputLoteFotosRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleLoteFotos(e.target.files)} />
                    </label>
                    <button
                      type="button"
                      onClick={() => void exportarPdfDireto()}
                      disabled={isExportingPdf}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      title="Exportar PDF"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      {isExportingPdf ? 'Exportando...' : 'Exportar PDF'}
                    </button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Documento (preview + impressão) — capa em card próprio, separada da barra e do bloco de croqui */}
            <div
              id="relatorio-print-root"
              className="space-y-4 sm:space-y-5 print:space-y-0"
            >
              {/* Croqui + Localização */}
              <div
                className={`relatorio-primeira-folha w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 print:shadow-none print:max-w-none print:rounded-none ${
                  hasCoverContent ? '' : 'relatorio-primeira-folha--empty'
                }`}
              >
                <div className="py-2 text-center font-bold uppercase tracking-widest text-white bg-red-600 dark:bg-red-700">
                  RELATÓRIO FOTOGRAFICO
                </div>
                <div className="p-3 sm:p-4 space-y-4 sm:space-y-5">
                  {(
                    [
                      {
                        titulo: 'CROQUI DA UNIDADE',
                        src: croqui,
                        setter: setCroqui,
                        placeholder: 'Clique para adicionar o croqui da unidade',
                      },
                      {
                        titulo: 'LOCALIZAÇÃO',
                        src: localizacao,
                        setter: setLocalizacao,
                        placeholder: 'Clique para adicionar a imagem de localização',
                      },
                    ] as const
                  ).map(({ titulo, src, setter, placeholder }, idx) => (
                    <div
                      key={titulo}
                      className={`relatorio-bloco-wrapper ${idx > 0 ? 'pt-2' : ''}`}
                      data-empty={src ? 'false' : 'true'}
                    >
                      <div
                        className="relative rounded-t-md border border-b-0 border-gray-200 dark:border-gray-600
                          bg-gray-100 dark:bg-gray-700/80 py-1.5 px-2 text-center text-[11px] font-bold uppercase
                          tracking-wide text-gray-800 dark:text-gray-100"
                      >
                        {titulo}
                        {src && (
                          <button
                            type="button"
                            onClick={() => {
                              setter(null);
                              mark();
                            }}
                            className="relatorio-bloco-remover absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            title="Remover"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div
                        className={`relatorio-bloco-img-area relative border border-gray-200 dark:border-gray-600
                          rounded-b-md min-h-[200px] sm:min-h-[220px] lg:h-[270px] flex items-center justify-center
                          overflow-hidden ${
                            src
                              ? 'bg-white dark:bg-gray-900'
                              : 'bg-gray-50 dark:bg-gray-900/40 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/60'
                          } transition-colors`}
                      >
                        {src ? (
                          <img
                            src={src}
                            alt={titulo}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <label className="relatorio-placeholder flex flex-col items-center justify-center gap-2 w-full h-full min-h-[200px] cursor-pointer p-4 text-center">
                            <ImagePlus
                              className="w-10 h-10 text-gray-400 dark:text-gray-500"
                              strokeWidth={1.2}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{placeholder}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden relatorio-foto-input"
                              onChange={(e) => handleImgChange(e.target.files?.[0], setter)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grade de fotos */}
              {gruposRender.map((grupoRender, gi) => (
                <div
                  key={gi}
                  className={`relatorio-grupo-pagina w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 print:shadow-none print:rounded-none ${
                    gi === 0 ? 'relatorio-grupo-pagina--first' : ''
                  }`}
                >
                  {/* Faixa título — edge-to-edge, sem padding extra, igual CROQUI DA UNIDADE */}
                  <div className="py-2 text-center font-bold uppercase tracking-widest text-white bg-red-600 dark:bg-red-700">
                    Registro Fotográfico
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="relatorio-grade grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {grupoRender.fotos.map((foto, fi) => {
                        const numGlobal = gi * FOTOS_POR_PAGINA + fi + 1;
                        return (
                          <div
                            key={foto.id}
                            className="relatorio-foto-card flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800 shadow-sm print:shadow-none"
                          >
                            {/* Cabeçalho do card: número da foto centralizado + X para remover */}
                            <div className="relatorio-numero-foto flex items-center border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/80 px-2 py-1.5
                              [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
                              <div className="flex-1" />
                              <span className="text-[11px] font-bold tracking-widest uppercase text-gray-800 dark:text-gray-100">
                                Foto {String(numGlobal).padStart(2, '0')}
                              </span>
                              <div className="flex flex-1 justify-end">
                                <button
                                  type="button"
                                  onClick={() => removerFoto(foto.id)}
                                  className="relatorio-foto-remover flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                  title="Remover foto do relatório"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Área da imagem */}
                            <div
                              className={`relatorio-foto-area relative w-full aspect-video flex items-center justify-center overflow-hidden ${
                                foto.src
                                  ? 'bg-white dark:bg-gray-900'
                                  : 'bg-gray-50 dark:bg-gray-900/40 cursor-pointer'
                              }`}
                            >
                              {foto.src ? (
                                <>
                                  <img
                                    src={foto.src}
                                    alt={`Foto ${numGlobal}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => clearFotoSrc(foto.id)}
                                    className="relatorio-foto-remover absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                                    title="Trocar imagem"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                  <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 flex items-center justify-center bg-black/10 transition-opacity" title="Clique para trocar a imagem">
                                    <input type="file" accept="image/*" className="hidden relatorio-foto-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFotoSrc(foto.id, f); }} />
                                  </label>
                                </>
                              ) : (
                                <label
                                  className="relatorio-placeholder flex flex-col items-center justify-center gap-2 w-full h-full min-h-[140px] cursor-pointer text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 transition-colors"
                                >
                                  <ImagePlus className="w-9 h-9" strokeWidth={1.3} />
                                  <span className="text-xs">Clique para adicionar</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden relatorio-foto-input"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) setFotoSrc(foto.id, f);
                                    }}
                                  />
                                </label>
                              )}
                            </div>

                            {/* Inputs de título e descrição */}
                            <div className="p-2.5 space-y-2 border-t border-gray-100 dark:border-gray-700">
                              <input
                                type="text"
                                placeholder="Título da foto..."
                                value={foto.titulo}
                                onChange={(e) => setFotoTitulo(foto.id, e.target.value)}
                                className={inputFotoClasse}
                              />
                              <textarea
                                placeholder="Descrição da imagem..."
                                value={foto.desc}
                                onChange={(e) => setFotoDesc(foto.id, e.target.value)}
                                rows={2}
                                className={inputFotoClasse + ' resize-none'}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {grupoRender.showAddSlot && (
                        <button
                          type="button"
                          onClick={adicionarFoto}
                          className={
                            'relatorio-add-foto-slot flex w-full flex-col items-center justify-center gap-2 self-stretch rounded-lg border-2 border-dashed border-gray-300 ' +
                            'bg-gray-50 dark:bg-gray-900/40 py-10 text-sm font-medium text-gray-500 transition-colors ' +
                            'hover:border-red-400/80 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-red-700 ' +
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 ' +
                            'dark:border-gray-500 dark:text-gray-400 dark:hover:border-red-400/55 dark:hover:bg-red-900/15 dark:hover:text-red-400 ' +
                            'min-h-[22rem] h-full ' +
                            (grupoRender.fotos.length === 0 ? 'sm:col-span-2 ' : '')
                          }
                        >
                          <Plus className="h-8 w-8 shrink-0" />
                          Adicionar foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
              </>
            )}
          </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
