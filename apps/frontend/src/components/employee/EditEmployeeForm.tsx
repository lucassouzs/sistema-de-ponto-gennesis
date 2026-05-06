'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, X, Save, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TOMADORES_LIST } from '@/constants/tomadores';
import { CARGOS_AVAILABLE } from '@/constants/cargos';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface EmployeeFormData {
  // Dados do usuário
  name: string;
  email: string;
  cpf: string;
  isActive: boolean;
  
  // Dados do funcionário
  employeeId: string;
  sector: string;
  position: string;
  hireDate: string;
  birthDate: string;
  salary: string;
  isRemote: boolean;
  workStartTime: string;
  workEndTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
  toleranceMinutes: string;
  costCenter: string;
  client: string;
  dailyFoodVoucher: string;
  dailyTransportVoucher: string;
  
  // Novos campos - Dados da Empresa
  company: string;
  
  // Novos campos - Dados Bancários
  bank: string;
  accountType: string;
  agency: string;
  operation: string;
  account: string;
  digit: string;
  
  // Novos campos - Dados PIX
  pixKeyType: string;
  pixKey: string;
  
  // Novos campos - Modalidade e Adicionais
  modality: 'MEI' | 'CLT' | 'ESTAGIARIO' | '';
  familySalary: string;
  dangerPay: string; // Porcentagem de periculosidade (0-100)
  unhealthyPay: string; // Porcentagem de insalubridade (0-100)
  
  // Novos campos - Polo e Categoria Financeira
  polo: 'BRASÍLIA' | 'GOIÁS' | '';
  categoriaFinanceira: 'CUSTO' | 'DESPESA' | '';
  
  // Campo para controlar se precisa bater ponto
  requiresTimeClock: boolean;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  isActive: boolean;
  employee?: {
    id: string;
    employeeId: string;
    department: string;
    position: string;
    hireDate: string;
    birthDate?: string;
    salary: number;
    isRemote: boolean;
    workSchedule: any;
    costCenter?: string;
    client?: string;
    dailyFoodVoucher?: number;
    dailyTransportVoucher?: number;
    company?: string;
    bank?: string;
    accountType?: string;
    agency?: string;
    operation?: string;
    account?: string;
    digit?: string;
    pixKeyType?: string;
    pixKey?: string;
    modality?: string;
    familySalary?: number;
    dangerPay?: number;
    unhealthyPay?: number;
    // Novos campos - Polo e Categoria Financeira
    polo?: string;
    categoriaFinanceira?: string;
    // Campo para controlar se precisa bater ponto
    requiresTimeClock?: boolean;
  };
}

type VisibleSection = 'personal' | 'professional' | 'bank' | 'remuneration';

interface EditEmployeeFormProps {
  employee: Employee;
  onClose: () => void;
  visibleSections?: VisibleSection[];
  onEmployeeUpdated?: (updatedEmployee: Employee) => void;
}

export function EditEmployeeForm({ employee, onClose, visibleSections, onEmployeeUpdated }: EditEmployeeFormProps) {
  const { costCentersList } = useCostCenters();
  
  // Lista de setores disponíveis
  const sectors = [
    'Projetos',
    'Contratos e Licitações',
    'Suprimentos',
    'Jurídico',
    'Departamento Pessoal',
    'Engenharia',
    'Administrativo',
    'Financeiro'
  ];

  // Lista de cargos disponíveis (sem Administrador e sem Diretor)
  const positions = CARGOS_AVAILABLE.filter(cargo => cargo !== 'Diretor');

  // Lista de empresas
  const companies = [
    'ABRASIL',
    'GÊNNESIS',
    'MÉTRICA'
  ];

  // Lista de bancos
  const banks = [
    'BANCO DO BRASIL',
    'BRADESCO',
    'C6',
    'CAIXA ECONÔMICA',
    'CEF',
    'INTER',
    'ITAÚ',
    'NUBANK',
    'PICPAY',
    'SANTANDER'
  ];

  // Lista de tipos de conta
  const accountTypes = [
    'CONTA SALÁRIO',
    'CONTA CORRENTE',
    'POUPANÇA'
  ];

  // Lista de tipos de chave PIX
  const pixKeyTypes = [
    'ALEATÓRIA',
    'CELULAR',
    'CNPJ',
    'CPF',
    'E-MAIL'
  ];

  // Utilidades de moeda BRL
  const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const parseCurrencyBRToNumber = (raw: string) => {
    if (!raw) return 0;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return 0;
    return parseInt(digits, 10) / 100;
  };

  const maskCurrencyInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    const asNumber = digits ? parseInt(digits, 10) / 100 : 0;
    return currencyFormatter.format(asNumber);
  };

  // Utilidades de porcentagem 0-100
  const parsePercentToNumber = (raw: string) => {
    if (!raw) return 0;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return 0;
    const value = Math.min(100, parseInt(digits, 10));
    return value;
  };

  const maskPercentInput = (raw: string) => {
    const value = parsePercentToNumber(raw);
    return `${value}%`;
  };

  // Inicializar dados do formulário com dados do funcionário
  const [formData, setFormData] = useState<EmployeeFormData>({
    name: employee.name || '',
    email: employee.email || '',
    cpf: employee.cpf || '',
    isActive: employee.isActive ?? true,
    employeeId: employee.employee?.employeeId || '',
    sector: employee.employee?.department || '',
    position: employee.employee?.position || '',
    hireDate: employee.employee?.hireDate ? new Date(employee.employee.hireDate).toISOString().split('T')[0] : '',
    birthDate: employee.employee?.birthDate ? new Date(employee.employee.birthDate).toISOString().split('T')[0] : '',
    salary: employee.employee?.salary !== undefined && employee.employee?.salary !== null ? currencyFormatter.format(employee.employee.salary) : '',
    isRemote: employee.employee?.isRemote ?? false,
    workStartTime: employee.employee?.workSchedule?.startTime || '07:00',
    workEndTime: employee.employee?.workSchedule?.endTime || '17:00',
    lunchStartTime: employee.employee?.workSchedule?.lunchStartTime || '12:00',
    lunchEndTime: employee.employee?.workSchedule?.lunchEndTime || '13:00',
    toleranceMinutes: employee.employee?.workSchedule?.toleranceMinutes?.toString() || '10',
    costCenter: employee.employee?.costCenter || '',
    client: employee.employee?.client || '',
    dailyFoodVoucher: employee.employee?.dailyFoodVoucher !== undefined && employee.employee?.dailyFoodVoucher !== null ? currencyFormatter.format(employee.employee.dailyFoodVoucher) : '',
    dailyTransportVoucher: employee.employee?.dailyTransportVoucher !== undefined && employee.employee?.dailyTransportVoucher !== null ? currencyFormatter.format(employee.employee.dailyTransportVoucher) : '',
    company: employee.employee?.company || '',
    bank: employee.employee?.bank || '',
    accountType: employee.employee?.accountType || '',
    agency: employee.employee?.agency || '',
    operation: employee.employee?.operation || '',
    account: employee.employee?.account || '',
    digit: employee.employee?.digit || '',
    pixKeyType: employee.employee?.pixKeyType || '',
    pixKey: employee.employee?.pixKey || '',
    modality: (employee.employee?.modality as any) || '',
    familySalary: employee.employee?.familySalary !== undefined && employee.employee?.familySalary !== null ? currencyFormatter.format(employee.employee.familySalary) : '',
    dangerPay: employee.employee?.dangerPay !== undefined && employee.employee?.dangerPay !== null ? `${employee.employee.dangerPay}%` : '0%',
    unhealthyPay: employee.employee?.unhealthyPay !== undefined && employee.employee?.unhealthyPay !== null ? `${employee.employee.unhealthyPay}%` : '0%',
    
    // Novos campos - Polo e Categoria Financeira
    polo: (employee.employee?.polo as any) || '',
    categoriaFinanceira: (employee.employee?.categoriaFinanceira as any) || '',
    
    // Campo para controlar se precisa bater ponto
    requiresTimeClock: employee.employee?.requiresTimeClock !== undefined ? employee.employee.requiresTimeClock : true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasOperation, setHasOperation] = useState<boolean>(() => {
    const op = employee.employee?.operation || '';
    return !!(op && op !== 'N/A' && op.trim() !== '');
  });

  const queryClient = useQueryClient();

  // Função para validar CPF
  const isValidCPF = (cpf: string): boolean => {
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    // Validar dígitos verificadores
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10))) return false;
    
    return true;
  };

  // Função para formatar CPF
  const formatCPF = (value: string): string => {
    // Remove tudo que não é dígito
    const numbers = value.replace(/\D/g, '');
    
    // Aplica a máscara
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 6) {
      return numbers.replace(/(\d{3})(\d+)/, '$1.$2');
    } else if (numbers.length <= 9) {
      return numbers.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    } else {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
    }
  };

  // Função para validar email
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Função para verificar se o email já existe
  const checkEmailExists = async (email: string) => {
    // Não verificar se o email não mudou
    if (email === employee.email) {
      // Limpar erro se o email voltou ao original
      if (errors.email && errors.email.includes('já está em uso')) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.email;
          return newErrors;
        });
      }
      return;
    }

    // Validar formato básico de email
    if (!email || !isValidEmail(email)) {
      // Limpar erro se o email não estiver em formato válido
      if (errors.email && errors.email.includes('já está em uso')) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.email;
          return newErrors;
        });
      }
      return;
    }

    setIsCheckingEmail(true);
    try {
      const response = await api.get('/users/check-email', {
        params: { email: email.trim() }
      });

      if (response.data.exists) {
        setErrors(prev => ({
          ...prev,
          email: 'Este email já está em uso'
        }));
      } else {
        // Limpar erro se o email não existir
        if (errors.email && errors.email.includes('já está em uso')) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.email;
            return newErrors;
          });
        }
      }
    } catch (error) {
      console.error('Erro ao verificar email:', error);
      // Não mostrar erro para o usuário se a verificação falhar
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleEmailChange = (value: string) => {
    handleInputChange('email', value);
    
    // Limpar timeout anterior se existir
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }
    
    // Limpar erro se o email não estiver em formato válido
    if (!value.trim() || !isValidEmail(value.trim())) {
      if (errors.email && errors.email.includes('já está em uso')) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.email;
          return newErrors;
        });
      }
      return;
    }
    
    // Usar debounce para evitar muitas requisições
    emailCheckTimeoutRef.current = setTimeout(() => {
      checkEmailExists(value);
    }, 500);
  };

  // Limpar timeout ao desmontar
  useEffect(() => {
    return () => {
      if (emailCheckTimeoutRef.current) {
        clearTimeout(emailCheckTimeoutRef.current);
      }
    };
  }, []);

  // Função para validar formulário
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Email inválido';
    } else if (errors.email && errors.email.includes('já está em uso')) {
      // Manter o erro de email já em uso se existir
      newErrors.email = errors.email;
    }

    if (!formData.cpf.trim()) {
      newErrors.cpf = 'CPF é obrigatório';
    } else if (!isValidCPF(formData.cpf.replace(/\D/g, ''))) {
      newErrors.cpf = 'CPF inválido';
    }

    if (!formData.sector.trim()) {
      newErrors.sector = 'Departamento é obrigatório';
    }

    if (!formData.position.trim()) {
      newErrors.position = 'Cargo é obrigatório';
    }

    if (!formData.hireDate) {
      newErrors.hireDate = 'Data de admissão é obrigatória';
    }

    if (!formData.salary.trim()) {
      newErrors.salary = 'Salário é obrigatório';
    } else {
      const salaryValue = parseCurrencyBRToNumber(formData.salary);
      if (isNaN(salaryValue) || salaryValue <= 0) {
        newErrors.salary = 'Salário deve ser um valor válido';
      }
    }

    // Validação dos novos campos
    if (!formData.polo.trim()) newErrors.polo = 'Polo é obrigatório';
    if (!formData.categoriaFinanceira.trim()) newErrors.categoriaFinanceira = 'Categoria Financeira é obrigatória';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Função para lidar com mudanças nos inputs
  const handleInputChange = (field: keyof EmployeeFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Limpar erro do campo quando o usuário começar a digitar (exceto CPF que tem validação especial)
    if (errors[field] && field !== 'cpf') {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Função para lidar com mudanças no CPF
  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    handleInputChange('cpf', formatted);
    
    // Verificar CPF imediatamente quando tiver 11 dígitos
    const cpfNumbers = formatted.replace(/\D/g, '');
    if (cpfNumbers.length === 11) {
      // Validar CPF inválido
      if (!isValidCPF(cpfNumbers)) {
        setErrors(prev => ({
          ...prev,
          cpf: 'CPF inválido'
        }));
      } else {
        // Se o CPF for válido, limpar erro de inválido
        if (errors.cpf && errors.cpf === 'CPF inválido') {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.cpf;
            return newErrors;
          });
        }
      }
    } else {
      // Limpar erro se o CPF não estiver completo
      if (errors.cpf && errors.cpf === 'CPF inválido') {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.cpf;
          return newErrors;
        });
      }
    }
  };

  // Mutation para atualizar funcionário
  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      // Preparar employeeData com apenas campos preenchidos
      const employeeData: any = {
        department: data.sector || undefined,
        position: data.position || undefined,
        hireDate: data.hireDate || undefined,
        birthDate: data.birthDate || undefined,
        salary: data.salary ? parseCurrencyBRToNumber(data.salary as any) : undefined,
        isRemote: data.isRemote,
        workSchedule: {
          startTime: data.workStartTime,
          endTime: data.workEndTime,
          lunchStartTime: data.lunchStartTime,
          lunchEndTime: data.lunchEndTime,
          toleranceMinutes: parseInt(data.toleranceMinutes),
          workDays: [1, 2, 3, 4, 5]
        },
        costCenter: data.costCenter || undefined,
        client: data.client || undefined,
        dailyFoodVoucher: data.dailyFoodVoucher ? parseCurrencyBRToNumber(data.dailyFoodVoucher as any) : undefined,
        dailyTransportVoucher: data.dailyTransportVoucher ? parseCurrencyBRToNumber(data.dailyTransportVoucher as any) : undefined,
        company: data.company || undefined,
        bank: data.bank || undefined,
        accountType: data.accountType || undefined,
        agency: data.agency || undefined,
        operation: hasOperation && data.operation ? data.operation : 'N/A',
        account: data.account || undefined,
        digit: data.digit || undefined,
        pixKeyType: data.pixKeyType || undefined,
        pixKey: data.pixKey || undefined,
        modality: data.modality || undefined,
        familySalary: data.familySalary ? parseCurrencyBRToNumber(data.familySalary as any) : undefined,
        dangerPay: data.dangerPay ? parsePercentToNumber(data.dangerPay as any) : undefined,
        unhealthyPay: data.unhealthyPay ? parsePercentToNumber(data.unhealthyPay as any) : undefined,
        polo: data.polo || undefined,
        categoriaFinanceira: data.categoriaFinanceira || undefined,
        
        // Campo para controlar se precisa bater ponto - sempre enviar, mesmo se for false
        requiresTimeClock: data.requiresTimeClock !== undefined ? data.requiresTimeClock : true
      };

      // Remover campos undefined ou vazios (exceto workSchedule, isRemote e requiresTimeClock)
      // requiresTimeClock deve sempre ser enviado, mesmo se for false
      Object.keys(employeeData).forEach(key => {
        if (key !== 'workSchedule' && key !== 'isRemote' && key !== 'requiresTimeClock' && (employeeData[key] === undefined || employeeData[key] === '')) {
          delete employeeData[key];
        }
      });
      
      // Garantir que requiresTimeClock sempre seja enviado (não pode ser removido)
      // O valor deve ser explicitamente false ou true, nunca undefined
      employeeData.requiresTimeClock = data.requiresTimeClock !== undefined ? data.requiresTimeClock : true;

      const response = await api.put(`/users/${employee.id}`, {
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        isActive: data.isActive,
        employeeData
      });
      return response.data;
    },
    onSuccess: async (response) => {
      const updatedEmployee = response?.data;
      
      // Atualizar o cache diretamente com os dados retornados
      if (updatedEmployee) {
        // Atualizar todas as queries de employees no cache
        queryClient.setQueriesData(
          { queryKey: ['employees'], exact: false },
          (oldData: any) => {
            if (!oldData?.data) return oldData;
            
            // Atualizar o funcionário na lista
            const updatedData = oldData.data.map((emp: any) => 
              emp.id === employee.id ? updatedEmployee : emp
            );
            
            return {
              ...oldData,
              data: updatedData
            };
          }
        );
        
        // Notificar o componente pai sobre a atualização
        if (onEmployeeUpdated) {
          onEmployeeUpdated(updatedEmployee);
        }
      }
      
      // Invalidar e refetch para garantir sincronização completa
      queryClient.invalidateQueries({ 
        queryKey: ['employees'],
        exact: false
      });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      
      // Forçar refetch imediato
      await Promise.all([
        queryClient.refetchQueries({ 
          queryKey: ['employees'],
          exact: false,
          type: 'active'
        }),
        queryClient.refetchQueries({ 
          queryKey: ['user'],
          type: 'active'
        })
      ]);
      
      toast.success('Funcionário atualizado com sucesso!');
      
      // Fechar após garantir que tudo foi atualizado
      setTimeout(() => {
        onClose();
      }, 300);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar funcionário');
    }
  });

  // Função para submeter formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Verificar se há erro de email já em uso antes de validar
    if (errors.email && errors.email.includes('já está em uso')) {
      toast.error('Não é possível salvar: Este email já está em uso');
      return;
    }
    
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateEmployeeMutation.mutateAsync(formData);
      // Forçar atualização imediata após salvar
      await queryClient.refetchQueries({ 
        queryKey: ['employees'],
        exact: false
      });
    } catch (error) {
      console.error('Erro ao atualizar funcionário:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Editar Funcionário</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Atualize os dados do funcionário</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Dados Pessoais */}
              {(!visibleSections || visibleSections.includes('personal')) && (
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 dark:border-blue-400 pl-4">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dados Pessoais</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações básicas do funcionário</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full px-3 py-2.5 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                        errors.name ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                      placeholder="Digite o nome completo"
                    />
                    {errors.name && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                          errors.email 
                            ? 'border-red-500 dark:border-red-400 bg-white dark:bg-gray-700 focus:ring-red-500' 
                            : !isCheckingEmail && formData.email && isValidEmail(formData.email.trim()) && !errors.email
                            ? 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20 focus:ring-green-500'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-blue-500'
                        }`}
                        placeholder="email@exemplo.com"
                      />
                      {isCheckingEmail && formData.email && isValidEmail(formData.email.trim()) && formData.email !== employee.email && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                      {!isCheckingEmail && formData.email && isValidEmail(formData.email.trim()) && !errors.email && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                        </div>
                      )}
                    </div>
                    {errors.email && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      CPF
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formatCPF(formData.cpf)}
                        onChange={(e) => handleCPFChange(e.target.value)}
                        className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                          errors.cpf 
                            ? 'border-red-500 dark:border-red-400 bg-white dark:bg-gray-700 focus:ring-red-500' 
                            : formData.cpf.replace(/\D/g, '').length === 11 && isValidCPF(formData.cpf.replace(/\D/g, '')) && !errors.cpf
                            ? 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20 focus:ring-green-500'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-blue-500'
                        }`}
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                      {formData.cpf.replace(/\D/g, '').length === 11 && isValidCPF(formData.cpf.replace(/\D/g, '')) && !errors.cpf && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                        </div>
                      )}
                    </div>
                    {errors.cpf && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.cpf}
                      </p>
                    )}
                  </div>


                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => handleInputChange('birthDate', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer dark:[&::-webkit-calendar-picker-indicator]:invert"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Dados Profissionais */}
              {(!visibleSections || visibleSections.includes('professional')) && (
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 dark:border-blue-400 pl-4">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dados Profissionais</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações profissionais e da empresa</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Setor
                    </label>
                    <select
                      value={formData.sector}
                      onChange={(e) => handleInputChange('sector', e.target.value)}
                      className={`w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100 ${
                        errors.sector ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <option value="">Selecione o departamento</option>
                      {sectors.map(sector => (
                        <option key={sector} value={sector}>{sector}</option>
                      ))}
                    </select>
                    {errors.sector && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.sector}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Cargo
                    </label>
                    <select
                      value={formData.position}
                      onChange={(e) => handleInputChange('position', e.target.value)}
                      className={`w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100 ${
                        errors.position ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <option value="">Selecione o cargo</option>
                      {positions.map(position => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                    {errors.position && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.position}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de Admissão
                    </label>
                    <input
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) => handleInputChange('hireDate', e.target.value)}
                      className={`w-full px-3 py-2.5 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 ${
                        errors.hireDate ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    {errors.hireDate && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.hireDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modalidade</label>
                    <select
                      value={formData.modality}
                      onChange={(e) => handleInputChange('modality', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione</option>
                      <option value="CLT">CLT</option>
                      <option value="MEI">MEI</option>
                      <option value="ESTAGIARIO">Estagiário</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Regime</label>
                    <select
                      value={formData.isRemote ? 'REMOTO' : 'PRESENCIAL'}
                      onChange={(e) => handleInputChange('isRemote', e.target.value === 'REMOTO')}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="PRESENCIAL">Presencial</option>
                      <option value="REMOTO">Remoto</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresa</label>
                    <select
                      value={formData.company}
                      onChange={(e) => handleInputChange('company', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione a empresa</option>
                      {companies.map(company => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Centro de Custo</label>
                    <select
                      value={formData.costCenter}
                      onChange={(e) => handleInputChange('costCenter', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione um centro de custo</option>
                      {costCentersList.map((center) => (
                        <option key={center} value={center}>
                          {center}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tomador</label>
                    <select
                      value={formData.client}
                      onChange={(e) => handleInputChange('client', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione um tomador</option>
                      {TOMADORES_LIST.map((tomador) => (
                        <option key={tomador} value={tomador}>{tomador}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Polo</label>
                    <select
                      value={formData.polo}
                      onChange={(e) => handleInputChange('polo', e.target.value)}
                      className={`w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100 ${
                        errors.polo ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <option value="">Selecione o polo</option>
                      <option value="BRASÍLIA">BRASÍLIA</option>
                      <option value="GOIÁS">GOIÁS</option>
                    </select>
                    {errors.polo && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{errors.polo}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria Financeira</label>
                    <select
                      value={formData.categoriaFinanceira}
                      onChange={(e) => handleInputChange('categoriaFinanceira', e.target.value)}
                      className={`w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100 ${errors.categoriaFinanceira ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
                    >
                      <option value="">Selecione a categoria</option>
                      <option value="CUSTO">CUSTO</option>
                      <option value="DESPESA">DESPESA</option>
                    </select>
                    {errors.categoriaFinanceira && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{errors.categoriaFinanceira}</p>
                    )}
                  </div>

                </div>
              </div>
              )}

              {/* Toggle para controlar se precisa bater ponto - na seção de Dados Profissionais */}
              {(!visibleSections || visibleSections.includes('professional')) && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      Precisa bater ponto?
                    </label>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Se desativado, o funcionário não precisará bater ponto e não aparecerá nos relatórios de ponto
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('requiresTimeClock', !formData.requiresTimeClock)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      formData.requiresTimeClock
                        ? 'bg-blue-600 dark:bg-blue-500'
                        : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.requiresTimeClock ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
              )}

              {/* Remuneração */}
              {(!visibleSections || visibleSections.includes('remuneration')) && (
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 dark:border-blue-400 pl-4">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Valores e Adicionais</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações salariais e benefícios</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Salário Base
                    </label>
                    <input
                      type="text"
                      value={formData.salary}
                      onChange={(e) => setFormData(prev => ({ ...prev, salary: maskCurrencyInput(e.target.value) }))}
                      inputMode="numeric"
                      className={`w-full px-3 py-2.5 bg-white dark:bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                        errors.salary ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                      placeholder="R$ 0,00"
                    />
                    {errors.salary && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.salary}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Vale Alimentação Diário
                    </label>
                    <input
                      type="text"
                      value={formData.dailyFoodVoucher}
                      onChange={(e) => setFormData(prev => ({ ...prev, dailyFoodVoucher: maskCurrencyInput(e.target.value) }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="R$ 0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Vale Transporte Diário
                    </label>
                    <input
                      type="text"
                      value={formData.dailyTransportVoucher}
                      onChange={(e) => setFormData(prev => ({ ...prev, dailyTransportVoucher: maskCurrencyInput(e.target.value) }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Salário Família</label>
                    <input
                      type="text"
                      value={formData.familySalary}
                      onChange={(e) => setFormData(prev => ({ ...prev, familySalary: maskCurrencyInput(e.target.value) }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Periculosidade</label>
                    <input
                      type="text"
                      value={formData.dangerPay}
                      onChange={(e) => setFormData(prev => ({ ...prev, dangerPay: maskPercentInput(e.target.value) }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="0%"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Insalubridade</label>
                    <input
                      type="text"
                      value={formData.unhealthyPay}
                      onChange={(e) => setFormData(prev => ({ ...prev, unhealthyPay: maskPercentInput(e.target.value) }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="0%"
                    />
                  </div>
                </div>
              </div>
              )}

              

              {/* Dados Bancários e PIX */}
              {(!visibleSections || visibleSections.includes('bank')) && (
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 dark:border-blue-400 pl-4">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dados Bancários</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações bancárias e chave PIX</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banco</label>
                    <select
                      value={formData.bank}
                      onChange={(e)=>handleInputChange('bank', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione</option>
                      {banks.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Conta</label>
                    <select
                      value={formData.accountType}
                      onChange={(e)=>handleInputChange('accountType', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione</option>
                      {accountTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agência</label>
                    <input type="text" value={formData.agency} onChange={(e)=>handleInputChange('agency', e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Operação
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="hasOperation"
                          checked={hasOperation}
                          onChange={(e) => {
                            setHasOperation(e.target.checked);
                            if (!e.target.checked) {
                              handleInputChange('operation', '');
                            }
                          }}
                          className="h-4 w-4 text-blue-600 dark:text-blue-500 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                        />
                        <label htmlFor="hasOperation" className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                          Tem operação?
                        </label>
                      </div>
                    </div>
                    {hasOperation ? (
                      <input 
                        type="text" 
                        value={formData.operation} 
                        onChange={(e)=>handleInputChange('operation', e.target.value)} 
                        className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" 
                        placeholder="01"
                      />
                    ) : (
                      <div className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md text-gray-400 dark:text-gray-500 text-sm">
                        N/A
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Conta</label>
                    <input type="text" value={formData.account} onChange={(e)=>handleInputChange('account', e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dígito</label>
                    <input type="text" value={formData.digit} onChange={(e)=>handleInputChange('digit', e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Chave</label>
                    <select value={formData.pixKeyType} onChange={(e)=>handleInputChange('pixKeyType', e.target.value)} className="w-full px-3 py-2.5 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100">
                      <option value="">Selecione</option>
                      {pixKeyTypes.map((t)=> (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave PIX</label>
                    <input type="text" value={formData.pixKey} onChange={(e)=>handleInputChange('pixKey', e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
                  </div>
                </div>
              </div>
              )}

              {/* Botões de Ação */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>
        </form>
      </div>
    </div>
  );
}
