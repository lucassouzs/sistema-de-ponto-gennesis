'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Upload, Download, AlertCircle, CheckCircle, X, Loader2, Edit2, Trash2, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { CreateEmployeeForm } from '@/components/employee/CreateEmployeeForm';
import { EmployeeList } from '@/components/employee/EmployeeList';
import {
  UserPermissionsEditor,
  UserPermissionsTabBar,
  type PermissionEditorTab,
  type PermissionsTargetPreview,
} from '@/components/permissions/UserPermissionsEditor';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// Função para gerar e baixar modelo Excel
const downloadExcelTemplate = () => {
  // Dados do modelo
  const headers = [
    'Nome', 'Email', 'CPF', 'Setor', 'Cargo', 'Data de Admissão', 'Data de Nascimento',
    'Salário', 'Centro de Custo',
    'Tomador', 'Empresa', 'Banco', 'Tipo de Conta', 'Agência', 'Operação', 'Conta', 'Dígito',
    'Tipo Chave PIX', 'Chave PIX', 'Modalidade', 'Salário Família', 'Periculosidade', 'Insalubridade',
    'Polo', 'Categoria Financeira', 'VA Diário', 'VT Diário', 'Precisa Bater Ponto', 'Acréscimo Fixo'
  ];

  const exampleRow = [
    'João Silva', 'joao.silva@exemplo.com', '123.456.789-00', 'Projetos', 'Engenheiro',
    '2024-01-15', '1990-05-20', '5000.00', 'SEDES',
    'CLIENTE A', 'GÊNNESIS', 'BANCO DO BRASIL', 'CONTA CORRENTE', '1234-5', '01', '12345-6', '7',
    'CPF', '123.456.789-00', 'CLT', '0', '0', '0', 'BRASÍLIA', 'CUSTO', '33.40', '11.00', 'Sim', '0'
  ];

  // Criar workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  
  // Ajustar largura das colunas
  const colWidths = headers.map(() => ({ wch: 20 }));
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
  XLSX.writeFile(wb, 'modelo-importacao-funcionarios.xlsx');
};

interface EmployeeRow {
  linha: number;
  dados: {
    Nome: string;
    Email: string;
    CPF: string;
    Setor: string;
    Cargo: string;
    'Data de Admissão': string;
    'Data de Nascimento'?: string;
    Salário: string;
    'Centro de Custo'?: string;
    Tomador?: string;
    Empresa?: string;
    Banco?: string;
    'Tipo de Conta'?: string;
    Agência?: string;
    Operação?: string;
    Conta?: string;
    Dígito?: string;
    'Tipo Chave PIX'?: string;
    'Chave PIX'?: string;
    Modalidade?: string;
    'Salário Família'?: string;
    Periculosidade?: string;
    Insalubridade?: string;
    Polo?: string;
    'Categoria Financeira'?: string;
    'VA Diário'?: string;
    'VT Diário'?: string;
    'Precisa Bater Ponto'?: string;
    'Acréscimo Fixo'?: string;
  };
  erros: string[];
  isValid: boolean;
  matriculaGerada?: string;
}

export default function FuncionariosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreateEmployees } = usePermissions();
  const [isCreateEmployeeOpen, setIsCreateEmployeeOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [permissionsTarget, setPermissionsTarget] = useState<PermissionsTargetPreview | null>(null);
  const [permissionTab, setPermissionTab] = useState<PermissionEditorTab>('gerais');
  const [showContractsTab, setShowContractsTab] = useState(false);

  const closePermissionsEditor = () => {
    setPermissionsTarget(null);
    setPermissionTab('gerais');
    setShowContractsTab(false);
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleEmployeeCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    setIsCreateEmployeeOpen(false);
  };

  const handleEmployeeUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  };

  // Mostrar loading no padrão das outras páginas
  if (loadingUser) {
    return (
      <Loading 
        message="Carregando funcionários..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (permissionsTarget) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="w-full space-y-6">
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            <button
              type="button"
              onClick={closePermissionsEditor}
              className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Voltar
            </button>
            <div className="w-full max-w-3xl px-14 text-center sm:px-20">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                Permissões de funcionário
              </h1>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                Defina o que este colaborador pode acessar no sistema
              </p>
            </div>
          </div>
          <UserPermissionsTabBar
            activeTab={permissionTab}
            onChange={setPermissionTab}
            showContracts={showContractsTab}
            className="w-full pb-2"
          />
          <UserPermissionsEditor
            userId={permissionsTarget.id}
            preview={permissionsTarget}
            onBack={closePermissionsEditor}
            hideTopNavigation
            permissionTab={permissionTab}
            onPermissionTabChange={setPermissionTab}
            onContractsTabAvailabilityChange={setShowContractsTab}
          />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Funcionários
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Cadastre e gerencie os funcionários da empresa
          </p>
        </div>

        {/* Lista de Funcionários */}
        <EmployeeList
          userRole={user.role}
          showDeleteButton={true}
          onImportEmployees={canCreateEmployees ? () => setIsImportModalOpen(true) : undefined}
          onCreateEmployee={canCreateEmployees ? () => setIsCreateEmployeeOpen(true) : undefined}
          onManagePermissions={(emp) => {
            setPermissionTab('gerais');
            setShowContractsTab(false);
            setPermissionsTarget({
              id: emp.id,
              name: emp.name,
              email: emp.email || '',
              position: emp.employee?.position,
            });
          }}
        />

        {/* Modal de Criar Funcionário */}
        {isCreateEmployeeOpen && (
          <CreateEmployeeForm onClose={() => setIsCreateEmployeeOpen(false)} />
        )}

        {/* Modal de Importação */}
        {isImportModalOpen && (
          <ImportEmployeesModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['employees'] });
              setIsImportModalOpen(false);
            }}
            onDownloadTemplate={downloadExcelTemplate}
          />
        )}

      </div>
    </MainLayout>
  );
}

// Componente de Modal de Importação
function ImportEmployeesModal({ isOpen, onClose, onSuccess, onDownloadTemplate }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; onDownloadTemplate: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedRows, setParsedRows] = useState<EmployeeRow[]>([]);
  const [result, setResult] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Função auxiliar para converter data do Excel (pode vir como número ou string)
  const convertExcelDate = (value: any): string => {
    if (!value && value !== 0) return '';
    
    // Se é um objeto Date
    if (value instanceof Date && !isNaN(value.getTime())) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Se já é uma string
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '';
      
      // Se está no formato DD/MM/YYYY, converter para YYYY-MM-DD
      if (trimmed.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = trimmed.split('/');
        return `${year}-${month}-${day}`;
      }
      // Se está no formato DD-MM-YYYY, converter para YYYY-MM-DD
      if (trimmed.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = trimmed.split('-');
        return `${year}-${month}-${day}`;
      }
      // Se já está no formato YYYY-MM-DD, retornar
      if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return trimmed;
      }
      // Tentar parsear como data
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return trimmed;
    }
    
    // Se é um número (dias desde 1900-01-01), converter
    if (typeof value === 'number') {
      // Excel conta dias desde 1900-01-01, mas tem um bug: considera 1900 como ano bissexto
      const excelEpoch = new Date(1899, 11, 30); // 30 de dezembro de 1899
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    return '';
  };

  // Função para formatar valor monetário para exibição (mantém formato R$)
  const formatCurrencyValue = (value: string | number): string => {
    if (!value && value !== 0) return '';
    
    let num: number;
    if (typeof value === 'number') {
      num = value;
    } else {
      // Remove tudo que não é número ou vírgula/ponto
      const numStr = String(value).replace(/[^\d,.-]/g, '').replace(',', '.');
      num = parseFloat(numStr);
    }
    
    if (isNaN(num) || num === 0) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Função para converter valor formatado de volta para número (remove R$ e formata)
  const parseCurrencyValue = (value: string): string => {
    if (!value) return '';
    // Remove R$, espaços e pontos, mantém apenas números e vírgula
    return value.replace(/[R$\s.]/g, '').replace(',', '.');
  };

  // Processar planilha no frontend
  const parseSpreadsheet = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellText: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // Usar raw: true para pegar valores originais e depois converter
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

      if (rows.length === 0) {
        toast.error('Arquivo vazio ou sem dados válidos');
        setIsProcessing(false);
        return;
      }

      // Buscar última matrícula do ano atual (será gerada no backend, aqui só para preview)
      const currentYear = new Date().getFullYear().toString().slice(-2);
      let nextSequence = 1;

      // Processar cada linha
      const processedRows: EmployeeRow[] = rows.map((row, index) => {
        const linha = index + 2; // +2 porque linha 1 é cabeçalho e arrays começam em 0
        const erros: string[] = [];
        
        // Validações básicas
        if (!row.Nome) erros.push('Nome é obrigatório');
        if (!row.Email) erros.push('Email é obrigatório');
        if (!row.CPF) erros.push('CPF é obrigatório');
        if (!row.Setor) erros.push('Setor é obrigatório');
        if (!row.Cargo) erros.push('Cargo é obrigatório');
        if (!row['Data de Admissão']) erros.push('Data de Admissão é obrigatória');
        if (!row.Salário) erros.push('Salário é obrigatório');

        // Validar CPF - converter para string primeiro
        const cpfStr = String(row.CPF || '').trim();
        const cleanCpf = cpfStr.replace(/[.-]/g, '');
        if (cpfStr && cleanCpf.length !== 11) {
          erros.push('CPF inválido');
        }

        // Validar email - converter para string primeiro
        const emailStr = String(row.Email || '').trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailStr && !emailRegex.test(emailStr)) {
          erros.push('Email inválido');
        }

        // Gerar matrícula
        const matriculaGerada = `${currentYear}${nextSequence.toString().padStart(4, '0')}`;
        nextSequence++;

        return {
          linha,
          dados: {
            Nome: String(row.Nome || '').trim(),
            Email: String(row.Email || '').trim(),
            CPF: String(row.CPF || '').trim(),
            Setor: String(row.Setor || '').trim(),
            Cargo: String(row.Cargo || '').trim(),
            'Data de Admissão': convertExcelDate(row['Data de Admissão']),
            'Data de Nascimento': convertExcelDate(row['Data de Nascimento']),
            Salário: row.Salário ? formatCurrencyValue(row.Salário) : '',
            'Centro de Custo': String(row['Centro de Custo'] || '').trim(),
            Tomador: String(row.Tomador || '').trim(),
            Empresa: String(row.Empresa || '').trim(),
            Banco: String(row.Banco || '').trim(),
            'Tipo de Conta': String(row['Tipo de Conta'] || '').trim(),
            Agência: String(row.Agência || '').trim(),
            Operação: String(row.Operação || '').trim(),
            Conta: String(row.Conta || '').trim(),
            Dígito: String(row.Dígito || '').trim(),
            'Tipo Chave PIX': String(row['Tipo Chave PIX'] || '').trim(),
            'Chave PIX': String(row['Chave PIX'] || '').trim(),
            Modalidade: String(row.Modalidade || '').trim(),
            'Salário Família': row['Salário Família'] ? formatCurrencyValue(row['Salário Família']) : '',
            Periculosidade: row.Periculosidade ? formatCurrencyValue(row.Periculosidade) : '0,00',
            Insalubridade: row.Insalubridade ? formatCurrencyValue(row.Insalubridade) : '0,00',
            Polo: String(row.Polo || '').trim(),
            'Categoria Financeira': String(row['Categoria Financeira'] || '').trim(),
            'VA Diário': row['VA Diário'] ? formatCurrencyValue(row['VA Diário']) : '',
            'VT Diário': row['VT Diário'] ? formatCurrencyValue(row['VT Diário']) : '',
            'Precisa Bater Ponto': String(row['Precisa Bater Ponto'] || 'Sim').trim(),
            'Acréscimo Fixo': row['Acréscimo Fixo'] ? formatCurrencyValue(row['Acréscimo Fixo']) : '',
          },
          erros,
          isValid: erros.length === 0,
          matriculaGerada
        };
      });

      // Verificar duplicatas (CPF e Email) no backend
      try {
        const duplicateChecks = await Promise.all(
          processedRows.map(async (row) => {
            const cpfStr = String(row.dados.CPF || '').trim();
            const cleanCpf = cpfStr.replace(/[.-]/g, '');
            const emailStr = String(row.dados.Email || '').trim();
            
            const checks = await Promise.all([
              cleanCpf.length === 11 ? api.get(`/users/check-cpf?cpf=${encodeURIComponent(cleanCpf)}`).catch(() => ({ data: { exists: false } })) : Promise.resolve({ data: { exists: false } }),
              emailStr ? api.get(`/users/check-email?email=${encodeURIComponent(emailStr)}`).catch(() => ({ data: { exists: false } })) : Promise.resolve({ data: { exists: false } })
            ]);

            const cpfExists = checks[0].data?.exists || false;
            const emailExists = checks[1].data?.exists || false;

            if (cpfExists) {
              row.erros.push('CPF já cadastrado');
              row.isValid = false;
            }
            if (emailExists) {
              row.erros.push('Email já cadastrado');
              row.isValid = false;
            }

            return row;
          })
        );

        setParsedRows(duplicateChecks);
      } catch (error) {
        // Se der erro na verificação, usar os dados processados sem verificação de duplicatas
        setParsedRows(processedRows);
      }

      toast.success(`${processedRows.length} funcionário(s) processado(s)`);
    } catch (error: any) {
      console.error('Erro ao processar planilha:', error);
      toast.error('Erro ao processar planilha: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Atualizar linha editada
  const updateRow = (index: number, field: string, value: string) => {
    setParsedRows(prev => {
      const updated = [...prev];
      
      // Campos monetários que precisam ser formatados
      const currencyFields = ['Salário', 'VA Diário', 'VT Diário', 'Acréscimo Fixo', 'Salário Família', 'Periculosidade', 'Insalubridade'];
      let formattedValue = value;
      
      if (currencyFields.includes(field)) {
        // Se o usuário digitou, formatar automaticamente (sem R$ no input, só números)
        if (value && value.trim() !== '') {
          // Remove R$ e formata apenas números
          const numStr = value.replace(/[R$\s.]/g, '').replace(',', '.');
          const num = parseFloat(numStr);
          if (!isNaN(num)) {
            formattedValue = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          } else {
            formattedValue = '0,00';
          }
        } else {
          // Se vazio, definir como 0 formatado
          formattedValue = '0,00';
        }
      }
      
      updated[index] = {
        ...updated[index],
        dados: {
          ...updated[index].dados,
          [field]: formattedValue
        }
      };
      
      // Revalidar linha
      const row = updated[index];
      const erros: string[] = [];
      
      if (!row.dados.Nome) erros.push('Nome é obrigatório');
      if (!row.dados.Email) erros.push('Email é obrigatório');
      if (!row.dados.CPF) erros.push('CPF é obrigatório');
      if (!row.dados.Setor) erros.push('Setor é obrigatório');
      if (!row.dados.Cargo) erros.push('Cargo é obrigatório');
      if (!row.dados['Data de Admissão']) erros.push('Data de Admissão é obrigatória');
      if (!row.dados.Salário) erros.push('Salário é obrigatório');

      const cpfStr = String(row.dados.CPF || '').trim();
      const cleanCpf = cpfStr.replace(/[.-]/g, '');
      if (cpfStr && cleanCpf.length !== 11) {
        erros.push('CPF inválido');
      }

      const emailStr = String(row.dados.Email || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailStr && !emailRegex.test(emailStr)) {
        erros.push('Email inválido');
      }

      updated[index] = {
        ...updated[index],
        erros,
        isValid: erros.length === 0
      };

      // Verificar duplicatas de CPF e Email de forma assíncrona
      if ((field === 'CPF' || field === 'Email') && erros.length === 0) {
        const checkDuplicates = async () => {
          const currentRow = updated[index];
          const cpfStr = String(currentRow.dados.CPF || '').trim();
          const cleanCpf = cpfStr.replace(/[.-]/g, '');
          const emailStr = String(currentRow.dados.Email || '').trim();
          
          const newErros = [...currentRow.erros];
          
          if (cleanCpf.length === 11) {
            try {
              const cpfCheck = await api.get(`/users/check-cpf?cpf=${encodeURIComponent(cleanCpf)}`);
              if (cpfCheck.data?.exists) {
                if (!newErros.includes('CPF já cadastrado')) {
                  newErros.push('CPF já cadastrado');
                }
              } else {
                // Remover erro de CPF duplicado se não existir mais
                const cpfErrorIndex = newErros.indexOf('CPF já cadastrado');
                if (cpfErrorIndex > -1) {
                  newErros.splice(cpfErrorIndex, 1);
                }
              }
            } catch (error) {
              // Ignorar erro na verificação
            }
          }
          
          if (emailStr && emailRegex.test(emailStr)) {
            try {
              const emailCheck = await api.get(`/users/check-email?email=${encodeURIComponent(emailStr)}`);
              if (emailCheck.data?.exists) {
                if (!newErros.includes('Email já cadastrado')) {
                  newErros.push('Email já cadastrado');
                }
              } else {
                // Remover erro de Email duplicado se não existir mais
                const emailErrorIndex = newErros.indexOf('Email já cadastrado');
                if (emailErrorIndex > -1) {
                  newErros.splice(emailErrorIndex, 1);
                }
              }
            } catch (error) {
              // Ignorar erro na verificação
            }
          }
          
          setParsedRows(prev => {
            const newUpdated = [...prev];
            newUpdated[index] = {
              ...newUpdated[index],
              erros: newErros,
              isValid: newErros.length === 0
            };
            return newUpdated;
          });
        };
        
        checkDuplicates();
      }

      return updated;
    });
  };

  // Toggle para "Precisa Bater Ponto"
  const toggleBaterPonto = (index: number) => {
    setParsedRows(prev => {
      const updated = [...prev];
      const currentValue = updated[index].dados['Precisa Bater Ponto'];
      updated[index] = {
        ...updated[index],
        dados: {
          ...updated[index].dados,
          'Precisa Bater Ponto': currentValue?.toLowerCase() === 'sim' || currentValue === 'Sim' ? 'Não' : 'Sim'
        }
      };
      return updated;
    });
  };

  // Remover linha
  const removeRow = (index: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== index));
  };

  // Importar funcionários
  const importMutation = useMutation({
    mutationFn: async (rows: EmployeeRow[]) => {
      const validRows = rows.filter(r => r.isValid);
      const res = await api.post('/users/import/bulk', { 
        employees: validRows.map(r => {
          // Converter valores monetários formatados de volta para string numérica
          const parseCurrency = (val: string) => {
            if (!val) return '';
            return val.replace(/[R$\s.]/g, '').replace(',', '.');
          };
          
          return {
            ...r.dados,
            Salário: parseCurrency(r.dados.Salário),
            'VA Diário': parseCurrency(r.dados['VA Diário'] || ''),
            'VT Diário': parseCurrency(r.dados['VT Diário'] || ''),
            'Acréscimo Fixo': parseCurrency(r.dados['Acréscimo Fixo'] || ''),
            'Salário Família': parseCurrency(r.dados['Salário Família'] || ''),
            Periculosidade: parseCurrency(r.dados['Periculosidade'] || '0'),
            Insalubridade: parseCurrency(r.dados['Insalubridade'] || '0'),
            matriculaGerada: r.matriculaGerada
          };
        })
      });
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data.data);
      setIsUploading(false);
      if (data.data.erros === 0) {
        toast.success(`✅ ${data.data.sucessos} funcionário(s) importado(s) com sucesso!`);
        onSuccess();
      } else {
        toast.error(`⚠️ ${data.data.sucessos} importado(s), ${data.data.erros} erro(s)`);
      }
    },
    onError: (error: any) => {
      setIsUploading(false);
      toast.error(error.response?.data?.error || 'Erro ao importar funcionários');
    },
  });

  const handleImport = () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      toast.error('Nenhum funcionário válido para importar');
      return;
    }
    setIsUploading(true);
    importMutation.mutate(parsedRows);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos');
        return;
      }
      setFile(selectedFile);
      setParsedRows([]);
      setResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importar Funcionários</h3>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Botão de Download do Modelo */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Baixe o modelo Excel, preencha com os dados dos funcionários e importe
              </p>
            </div>
            <button
              onClick={onDownloadTemplate}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Modelo</span>
            </button>
          </div>

          {/* Upload de arquivo com drag and drop */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Planilha de Funcionários</span>
              </div>
            </label>
            
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              id="file-upload"
              className="hidden"
            />
            
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile && (droppedFile.name.match(/\.(xlsx|xls)$/i))) {
                  setFile(droppedFile);
                  setParsedRows([]);
                  setResult(null);
                } else {
                  toast.error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos');
                }
              }}
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${isDragging 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
                }
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
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setParsedRows([]);
                      setResult(null);
                    }}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline"
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <Upload className={`w-10 h-10 ${isDragging ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {isDragging ? 'Solte o arquivo aqui' : 'Arraste e solte o arquivo Excel aqui'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ou
                    </p>
                  </div>
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Escolher arquivo
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Formatos aceitos: .xlsx ou .xls
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botão Processar */}
          {file && parsedRows.length === 0 && (
            <button
              onClick={parseSpreadsheet}
              disabled={!file || isProcessing}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors duration-200 shadow-sm hover:shadow-md"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Validar Dados</span>
                </>
              )}
            </button>
          )}

          {/* Preview dos Registros */}
          {parsedRows.length > 0 && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Preview dos Funcionários
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {parsedRows.filter(r => r.isValid).length} válido(s) de {parsedRows.length} total
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Revise e edite os dados antes de importar. Linhas em vermelho têm erros que precisam ser corrigidos.
                </p>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900">
                  <table className="w-full text-sm" style={{ minWidth: '2000px' }}>
                    <thead className="bg-gray-50/50 dark:bg-gray-800/50 sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-800 z-30 min-w-[60px] max-w-[60px]">
                          Linha
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[180px] max-w-[180px]">
                          Erros
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[150px]">
                          Nome
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[150px]">
                          Email
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                          CPF
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Setor
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                          Cargo
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Data Adm.
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Data Nasc.
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Salário
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Centro Custo
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Tomador
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Empresa
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Banco
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Tipo Conta
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[80px]">
                          Agência
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[80px]">
                          Operação
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Conta
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[60px]">
                          Dígito
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Tipo PIX
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                          Chave PIX
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Modalidade
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Sal. Família
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Periculosidade
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Insalubridade
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Polo
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                          Cat. Financeira
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[80px]">
                          VA Diário
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[80px]">
                          VT Diário
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Bater Ponto
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                          Acréscimo Fixo
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider min-w-[80px]">
                          Matrícula
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-800 z-30 min-w-[60px] max-w-[60px]">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                      {parsedRows.map((row, index) => {
                        const getInputClass = (field: string, isRequired: boolean = false) => {
                          const isEmpty = !row.dados[field as keyof typeof row.dados];
                          return `w-full px-2.5 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                            !row.isValid && isRequired && isEmpty
                              ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                          } text-gray-900 dark:text-gray-100`;
                        };

                        return (
                          <tr
                            key={index}
                            className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${
                              !row.isValid ? 'bg-red-50/30 dark:bg-red-950/20' : 'bg-white dark:bg-gray-900'
                            }`}
                          >
                            <td className={`px-3 py-3 whitespace-nowrap sticky left-0 z-20 ${!row.isValid ? 'bg-red-50/30 dark:bg-red-950/20' : 'bg-white dark:bg-gray-900'}`}>
                              <span className={`text-xs font-medium ${!row.isValid ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {row.linha}
                              </span>
                            </td>
                            <td className="px-3 py-3 min-w-[180px] max-w-[180px]">
                              {row.erros.length > 0 ? (
                                <div className="flex items-start gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-red-600 dark:text-red-400 font-medium leading-relaxed">
                                      {row.erros.map((erro, idx) => (
                                        <div key={idx} className="truncate" title={erro}>
                                          {erro}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Válido</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Nome} onChange={(e) => updateRow(index, 'Nome', e.target.value)} className={getInputClass('Nome', true)} /></td>
                            <td className="px-3 py-3"><input type="email" value={row.dados.Email} onChange={(e) => updateRow(index, 'Email', e.target.value)} className={getInputClass('Email', true)} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.CPF} onChange={(e) => updateRow(index, 'CPF', e.target.value)} className={getInputClass('CPF', true)} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Setor} onChange={(e) => updateRow(index, 'Setor', e.target.value)} className={getInputClass('Setor', true)} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Cargo} onChange={(e) => updateRow(index, 'Cargo', e.target.value)} className={getInputClass('Cargo', true)} /></td>
                            <td className="px-3 py-3"><input type="date" value={row.dados['Data de Admissão']} onChange={(e) => updateRow(index, 'Data de Admissão', e.target.value)} className={getInputClass('Data de Admissão', true)} /></td>
                            <td className="px-3 py-3"><input type="date" value={row.dados['Data de Nascimento'] || ''} onChange={(e) => updateRow(index, 'Data de Nascimento', e.target.value)} className={getInputClass('Data de Nascimento')} /></td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados.Salário} 
                                  onChange={(e) => updateRow(index, 'Salário', e.target.value)} 
                                  placeholder="0,00"
                                  className={`${getInputClass('Salário', true)} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3"><input type="text" value={row.dados['Centro de Custo'] || ''} onChange={(e) => updateRow(index, 'Centro de Custo', e.target.value)} className={getInputClass('Centro de Custo')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Tomador || ''} onChange={(e) => updateRow(index, 'Tomador', e.target.value)} className={getInputClass('Tomador')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Empresa || ''} onChange={(e) => updateRow(index, 'Empresa', e.target.value)} className={getInputClass('Empresa')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Banco || ''} onChange={(e) => updateRow(index, 'Banco', e.target.value)} className={getInputClass('Banco')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados['Tipo de Conta'] || ''} onChange={(e) => updateRow(index, 'Tipo de Conta', e.target.value)} className={getInputClass('Tipo de Conta')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Agência || ''} onChange={(e) => updateRow(index, 'Agência', e.target.value)} className={getInputClass('Agência')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Operação || ''} onChange={(e) => updateRow(index, 'Operação', e.target.value)} className={getInputClass('Operação')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Conta || ''} onChange={(e) => updateRow(index, 'Conta', e.target.value)} className={getInputClass('Conta')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Dígito || ''} onChange={(e) => updateRow(index, 'Dígito', e.target.value)} className={getInputClass('Dígito')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados['Tipo Chave PIX'] || ''} onChange={(e) => updateRow(index, 'Tipo Chave PIX', e.target.value)} className={getInputClass('Tipo Chave PIX')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados['Chave PIX'] || ''} onChange={(e) => updateRow(index, 'Chave PIX', e.target.value)} className={getInputClass('Chave PIX')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Modalidade || ''} onChange={(e) => updateRow(index, 'Modalidade', e.target.value)} className={getInputClass('Modalidade')} /></td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados['Salário Família'] || ''} 
                                  onChange={(e) => updateRow(index, 'Salário Família', e.target.value)} 
                                  placeholder="0,00"
                                  className={`${getInputClass('Salário Família')} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados.Periculosidade || ''} 
                                  onChange={(e) => updateRow(index, 'Periculosidade', e.target.value || '0')} 
                                  onBlur={(e) => {
                                    if (!e.target.value || e.target.value.trim() === '') {
                                      updateRow(index, 'Periculosidade', '0');
                                    }
                                  }}
                                  placeholder="0,00"
                                  className={`${getInputClass('Periculosidade')} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados.Insalubridade || ''} 
                                  onChange={(e) => updateRow(index, 'Insalubridade', e.target.value || '0')} 
                                  onBlur={(e) => {
                                    if (!e.target.value || e.target.value.trim() === '') {
                                      updateRow(index, 'Insalubridade', '0');
                                    }
                                  }}
                                  placeholder="0,00"
                                  className={`${getInputClass('Insalubridade')} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3"><input type="text" value={row.dados.Polo || ''} onChange={(e) => updateRow(index, 'Polo', e.target.value)} className={getInputClass('Polo')} /></td>
                            <td className="px-3 py-3"><input type="text" value={row.dados['Categoria Financeira'] || ''} onChange={(e) => updateRow(index, 'Categoria Financeira', e.target.value)} className={getInputClass('Categoria Financeira')} /></td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados['VA Diário'] || ''} 
                                  onChange={(e) => updateRow(index, 'VA Diário', e.target.value)} 
                                  placeholder="0,00"
                                  className={`${getInputClass('VA Diário')} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados['VT Diário'] || ''} 
                                  onChange={(e) => updateRow(index, 'VT Diário', e.target.value)} 
                                  placeholder="0,00"
                                  className={`${getInputClass('VT Diário')} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => toggleBaterPonto(index)}
                                  className={`
                                    relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500
                                    ${(row.dados['Precisa Bater Ponto']?.toLowerCase() === 'sim' || !row.dados['Precisa Bater Ponto']) 
                                      ? 'bg-emerald-600 dark:bg-emerald-500' 
                                      : 'bg-gray-300 dark:bg-gray-600'
                                    }
                                  `}
                                >
                                  <span
                                    className={`
                                      inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm
                                      ${(row.dados['Precisa Bater Ponto']?.toLowerCase() === 'sim' || !row.dados['Precisa Bater Ponto']) 
                                        ? 'translate-x-5' 
                                        : 'translate-x-0.5'
                                      }
                                    `}
                                  />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">R$</span>
                                <input 
                                  type="text" 
                                  value={row.dados['Acréscimo Fixo'] || ''} 
                                  onChange={(e) => updateRow(index, 'Acréscimo Fixo', e.target.value)} 
                                  placeholder="0,00"
                                  className={`${getInputClass('Acréscimo Fixo')} pl-7`}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {row.matriculaGerada}
                              </span>
                            </td>
                            <td className={`px-3 py-3 whitespace-nowrap text-center sticky right-0 z-20 ${!row.isValid ? 'bg-red-50/30 dark:bg-red-950/20' : 'bg-white dark:bg-gray-900'}`}>
                              <button
                                onClick={() => removeRow(index)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="Remover funcionário"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Resumo de erros melhorado */}
                {parsedRows.some(r => !r.isValid) && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border-2 border-red-300 dark:border-red-700 shadow-sm">
                    <div className="flex items-center space-x-2 mb-3">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <p className="text-sm font-bold text-red-800 dark:text-red-200">
                        {parsedRows.filter(r => !r.isValid).length} funcionário(s) com erro(s) encontrado(s)
                      </p>
                    </div>
                    <div className="space-y-2 text-xs text-red-700 dark:text-red-300 max-h-40 overflow-y-auto">
                      {parsedRows.filter(r => !r.isValid).map((row, idx) => (
                        <div key={idx} className="flex items-start space-x-2 p-2 bg-red-100 dark:bg-red-900/50 rounded border border-red-200 dark:border-red-800">
                          <span className="font-bold text-red-800 dark:text-red-300 min-w-[50px]">Linha {row.linha}:</span>
                          <div className="flex-1">
                            {row.erros.map((erro, errIdx) => (
                              <div key={errIdx} className="flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400"></span>
                                <span>{erro}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botão Importar */}
              <div className="flex space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={importMutation.isPending || parsedRows.filter(r => r.isValid).length === 0}
                  className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Importar {parsedRows.filter(r => r.isValid).length} funcionário(s)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
