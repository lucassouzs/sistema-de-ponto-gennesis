 'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Search, X, Edit, Trash2, Download, BookPlus, FileSpreadsheet, CheckCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface BudgetNature {
  id: string;
  code?: string;
  name: string;
}

export default function NaturezaOrcamentariaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetNature | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['budget-natures', searchTerm],
    queryFn: async () => {
      const res = await api.get('/budget-natures', {
        params: { search: searchTerm || undefined, limit: 200 }
      });
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/budget-natures', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-natures'] });
      setShowForm(false);
      setEditingItem(null);
      setFormData({ code: '', name: '' });
      toast.success('Natureza orçamentária salva com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao salvar');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/budget-natures/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-natures'] });
      setShowForm(false);
      setEditingItem(null);
      setFormData({ code: '', name: '' });
      toast.success('Natureza orçamentária atualizada!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/budget-natures/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-natures'] });
      setShowDeleteId(null);
      toast.success('Registro excluído');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir');
    }
  });

  const handleEdit = (item: BudgetNature) => {
    setEditingItem(item);
    setFormData({ code: item.code || '', name: item.name || '' });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: { name: formData.name.trim(), code: formData.code.trim() || undefined } });
    } else {
      createMutation.mutate({ name: formData.name.trim(), code: formData.code.trim() || undefined });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const downloadExcelTemplate = () => {
    const headers = ['Código', 'Natureza'];
    const exampleRow = ['NAT-2026-001', 'Despesas com Pessoal'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const colWidths = [{ wch: 20 }, { wch: 60 }];
    // @ts-ignore
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'Naturezas');
    XLSX.writeFile(wb, 'modelo-importacao-naturezas.xlsx');
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post('/budget-natures/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Importação enviada');
      queryClient.invalidateQueries({ queryKey: ['budget-natures'] });
      setIsImportOpen(false);
      setFile(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao importar');
    }
  };

  // Import preview / parse UI states
  const [parsedRows, setParsedRows] = useState<Array<{ linha: number; dados: { Código?: string; Natureza?: string }; erros: string[]; isValid: boolean }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<any>(null);

  const parseSpreadsheet = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }
    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      if (!rows || rows.length === 0) {
        toast.error('Arquivo vazio ou sem dados válidos');
        setIsProcessing(false);
        return;
      }

      const processed = rows.map((row, index) => {
        const linha = index + 2;
        const nome = String(row['Natureza'] || row['Nome'] || row['name'] || '').trim();
        const codigo = String(row['Código'] || row['Code'] || row['codigo'] || row['code'] || '').trim();
        const erros: string[] = [];
        if (!nome) erros.push('Natureza obrigatória');
        return { linha, dados: { Código: codigo, Natureza: nome }, erros, isValid: erros.length === 0 };
      });

      // mark duplicate names within file as error
      const names = processed.map(r => (r.dados.Natureza || '').toLowerCase().trim());
      processed.forEach((r) => {
        const name = (r.dados.Natureza || '').toLowerCase().trim();
        if (name && names.filter(n => n === name).length > 1) {
          if (!r.erros.includes('Nome duplicado no arquivo')) r.erros.push('Nome duplicado no arquivo');
          r.isValid = false;
        }
      });

      setParsedRows(processed);
      toast.success(`${processed.length} linha(s) processada(s)`);
    } catch (error: any) {
      console.error('Erro ao processar planilha:', error);
      toast.error('Erro ao processar planilha: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsProcessing(false);
    }
  };

  const updateRow = (index: number, field: 'Código' | 'Natureza', value: string) => {
    setParsedRows(prev => {
      const updated = [...prev];
      const row = { ...updated[index] };
      row.dados = { ...row.dados, [field]: value };
      // revalidate
      const erros: string[] = [];
      if (!row.dados.Natureza || !String(row.dados.Natureza).trim()) erros.push('Natureza obrigatória');
      updated[index] = { ...row, erros, isValid: erros.length === 0 };
      return updated;
    });
  };

  const removeRow = (index: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== index));
  };

  const items: BudgetNature[] = listData?.data || [];
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) return <Loading message="Carregando..." fullScreen size="lg" />;

  return (
    <ProtectedRoute route="/ponto/natureza-orcamentaria">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Natureza Orçamentária</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Cadastre as naturezas orçamentárias</p>
          </div>

          <Card>
            <CardHeader className="border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <BookPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Naturezas</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{items.length} cadastrado(s)</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1 sm:flex-initial sm:min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por código ou natureza..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" />
                    Importar
                  </button>
                  <button
                    onClick={() => { setShowForm(true); setEditingItem(null); setFormData({ code: '', name: '' }); }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="px-6 py-12 text-center">
                  <Loading message="Carregando..." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 sm:px-6 py-4 text-left align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Código</th>
                        <th className="px-3 sm:px-6 py-4 text-left align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Natureza Orçamentária</th>
                        <th className="px-3 sm:px-6 py-4 text-right align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-3 sm:px-6 py-4 align-middle text-sm font-mono text-gray-900 dark:text-gray-100">{it.code || '-'}</td>
                          <td className="px-3 sm:px-6 py-4 align-middle text-sm text-gray-900 dark:text-gray-100">{it.name}</td>
                          <td className="px-3 sm:px-6 py-4 align-middle text-right">
                            <button onClick={() => handleEdit(it)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Editar">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => setShowDeleteId(it.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-1" title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                            Nenhuma natureza orçamentária cadastrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setShowForm(false); setEditingItem(null); }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editingItem ? 'Editar Natureza' : 'Nova Natureza'}</h2>
                <button onClick={() => { setShowForm(false); setEditingItem(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Código</label>
                  <input type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Natureza Orçamentária *</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button type="button" onClick={() => { setShowForm(false); setEditingItem(null); }} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{editingItem ? 'Atualizar' : 'Criar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Import Modal (novo: mesma estrutura do modal de Centros de Custo) */}
        {isImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="absolute inset-0" onClick={() => { setIsImportOpen(false); setFile(null); setParsedRows([]); setResult(null); }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importar Naturezas</h3>
                <button onClick={() => { setIsImportOpen(false); setFile(null); setParsedRows([]); setResult(null); }} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" aria-label="Fechar">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Botão de Download do Modelo */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Baixe o modelo Excel, preencha com as naturezas e importe.
                    </p>
                  </div>
                  <button onClick={downloadExcelTemplate} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2 transition-colors text-sm">
                    <Download className="w-4 h-4" />
                    <span>Baixar Modelo</span>
                  </button>
                </div>

                {/* Upload de arquivo */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Planilha de Naturezas</span>
                    </div>
                  </label>

                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} id="file-upload-nature" className="hidden" />

                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const dropped = e.dataTransfer.files[0];
                      if (dropped && dropped.name.match(/\.(xlsx|xls|csv)$/i)) {
                        setFile(dropped);
                        setParsedRows([]);
                        setResult(null);
                      } else {
                        toast.error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos');
                      }
                    }}
                    className={`
                      relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                      ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'}
                      ${file ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
                    `}
                  >
                    {file ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center">
                          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{file.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                        <button onClick={() => { setFile(null); setParsedRows([]); setResult(null); }} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline">Remover arquivo</button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-center">
                          <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                            <Upload className={`w-10 h-10 ${isDragging ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{isDragging ? 'Solte o arquivo aqui' : 'Arraste e solte o arquivo Excel aqui'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ou</p>
                        </div>
                        <label htmlFor="file-upload-nature" className="inline-flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md">
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Escolher arquivo
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Formatos aceitos: .xlsx ou .xls</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botão Processar / Preview */}
                {file && parsedRows.length === 0 && (
                  <button onClick={parseSpreadsheet} disabled={!file || isProcessing} className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors duration-200 shadow-sm hover:shadow-md">
                    {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" /><span>Processando...</span></>) : (<><CheckCircle className="w-5 h-5" /><span>Validar Dados</span></>)}
                  </button>
                )}

                {/* Preview */}
                {parsedRows.length > 0 && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Preview das Naturezas</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{parsedRows.filter(r => r.isValid).length} válido(s) de {parsedRows.length} total</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Linha</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Código</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Natureza *</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Erros</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {parsedRows.map((row, index) => (
                              <tr key={index} className={row.isValid ? '' : 'bg-red-50 dark:bg-red-900/10'}>
                                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{row.linha}</td>
                                <td className="px-4 py-2">
                                  <input type="text" value={row.dados.Código || ''} onChange={(e) => updateRow(index, 'Código', e.target.value)} className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                                </td>
                                <td className="px-4 py-2">
                                  <input type="text" value={row.dados.Natureza || ''} onChange={(e) => updateRow(index, 'Natureza', e.target.value)} className={`w-full px-2 py-1 border rounded ${row.isValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-300 dark:border-red-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`} />
                                </td>
                                <td className="px-4 py-2 text-sm text-red-600">{row.erros.join(', ') || '-'}</td>
                                <td className="px-4 py-2">
                                  <button onClick={() => removeRow(index)} className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"><X className="w-4 h-4" /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {parsedRows.some(r => !r.isValid) && (
                      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">⚠️ Linhas em vermelho têm erros que precisam ser corrigidos antes de importar.</p>
                        {parsedRows.filter(r => !r.isValid).map((row, idx) => (
                          <div key={idx} className="mt-2 text-xs text-yellow-700 dark:text-yellow-300"><strong>Linha {row.linha}:</strong> {row.erros.join(', ')}</div>
                        ))}
                      </div>
                    )}

                    {/* Botões Cancelar / Importar */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button onClick={() => { setIsImportOpen(false); setFile(null); setParsedRows([]); setResult(null); }} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
                      <button onClick={handleImport} disabled={isUploading || parsedRows.filter(r => r.isValid).length === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
                        {isUploading ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>Importando...</span></>) : (<><Upload className="w-4 h-4" /><span>Importar {parsedRows.filter(r => r.isValid).length} natureza(s)</span></>)}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteId(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Excluir registro?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Esta ação não pode ser desfeita.</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setShowDeleteId(null)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Cancelar</button>
                <button onClick={() => deleteMutation.mutate(showDeleteId!)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Excluir</button>
              </div>
            </div>
          </div>
        )}

      </MainLayout>
    </ProtectedRoute>
  );
}

