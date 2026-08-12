'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Save, AlertCircle, CheckCircle, Eye, EyeOff, ChevronRight, ChevronLeft, User, Briefcase, DollarSign, CreditCard, Clock, Loader2 } from 'lucide-react';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import {
  EMPLOYEE_CATEGORIA_FINANCEIRA_OPTIONS,
  EMPLOYEE_MODALITY_OPTIONS,
  EMPLOYEE_POLO_OPTIONS,
  PERCENT_0_100_STEP5_OPTIONS,
  selectTriggerErrorCls,
  stringsToSelectOptions,
} from '@/lib/selectOptionBuilders';
import { TOMADORES_LIST } from '@/constants/tomadores';
import { CARGOS_AVAILABLE } from '@/constants/cargos';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const FIELD_LABEL_CLS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const FIELD_GRID_CLS = 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5';

function fieldInputCls(hasError?: boolean, extra = '') {
  return [
    'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
    hasError ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function dateFieldErrorCls(hasError?: boolean) {
  return hasError ? '!border-red-500 dark:!border-red-400' : undefined;
}

function FormCheckbox({
  id,
  checked,
  onChange,
  label,
  labelClassName = 'text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors',
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  labelClassName?: string;
}) {
  return (
    <label htmlFor={id} className="group flex cursor-pointer select-none items-center gap-3">
      <div className="relative">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
            checked
              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
              : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
          }`}
        >
          {checked && (
            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className={labelClassName}>{label}</span>
    </label>
  );
}


interface EmployeeFormData {
  // Dados do usuário
  name: string;
  email: string;
  cpf: string;
  password: string;

  // Dados do funcionário
  employeeId: string;
  sector: string;
  position: string;
  hireDate: string;
  birthDate: string;
  hireTime: string;
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
  fixedAdjustments: string; // Acréscimos fixos (valor fixo mensal)

  // Novos campos - Polo e Categoria Financeira
  polo: 'BRASÍLIA' | 'GOIÁS' | '';
  categoriaFinanceira: 'CUSTO' | 'DESPESA' | '';
  
  // Campo para controlar se precisa bater ponto
  requiresTimeClock: boolean;
}

interface CreateEmployeeFormProps {
  onClose: () => void;
}

export function CreateEmployeeForm({ onClose }: CreateEmployeeFormProps) {
  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onClose();
  };

  const handleCancelCancel = () => {
    setShowCancelConfirm(false);
  };
  // Lista de setores disponíveis
  const sectors = [
    'Projetos',
    'Contratos e Licitações',
    'Suprimentos',
    'Jurídico',
    'Departamento Pessoal',
    'Engenharia',
    'Administrativo',
    'Financeiro',
    'Operacional',
    'Segurança do Trabalho',
    'Sócios',
  ];

  // Lista de cargos disponíveis (sem Administrador e sem Diretor)
  const positions = CARGOS_AVAILABLE.filter(cargo => cargo !== 'Diretor');

  // Lista de empresas
  const companies = [
    'ABRASIL',
    'GÊNNESIS',
    'MÉTRICA'
  ];

  // Buscar centros de custo da API
  const { costCentersList, costCenters: costCentersData } = useCostCenters();
  const costCenters = costCentersList;

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

  // Função para gerar matrícula aleatória
  const generateEmployeeId = () => {
    // Gera um número de 6 dígitos com prefixo baseado no ano atual
    const currentYear = new Date().getFullYear().toString().slice(-2); // Últimos 2 dígitos do ano
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4 dígitos aleatórios
    return `${currentYear}${randomNumber}`; // Ex: 24001, 24002, etc.
  };

  // Formatação de moeda
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

  const [formData, setFormData] = useState<EmployeeFormData>({
    name: '',
    email: '',
    cpf: '',
    password: '',
    employeeId: generateEmployeeId(),
    sector: '',
    position: '',
    hireDate: new Date().toISOString().split('T')[0],
    birthDate: '',
    hireTime: '07:00',
    salary: '',
    isRemote: false,
    workStartTime: '07:00',
    workEndTime: '17:00',
    lunchStartTime: '12:00',
    lunchEndTime: '13:00',
    toleranceMinutes: '10',
    costCenter: '',
    client: '',
    dailyFoodVoucher: currencyFormatter.format(33.40),
    dailyTransportVoucher: currencyFormatter.format(11.00),
    // Novos campos
    company: '',
    bank: '',
    accountType: '',
    agency: '',
    operation: 'N/A',
    account: '',
    digit: '',
    pixKeyType: '',
    pixKey: '',
    // Novos campos - Modalidade e Adicionais
    modality: '',
    familySalary: currencyFormatter.format(0),
    dangerPay: '0', // 0% por padrão
    unhealthyPay: '0', // 0% por padrão
    fixedAdjustments: currencyFormatter.format(0), // Acréscimos fixos

    // Novos campos - Polo e Categoria Financeira
    polo: '',
    categoriaFinanceira: '',
    
    // Campo para controlar se precisa bater ponto
    requiresTimeClock: true // Padrão: precisa bater ponto
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCheckingCpf, setIsCheckingCpf] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Estado para controlar a etapa atual do formulário
  const [currentStep, setCurrentStep] = useState(1);

  const companyOptions = useMemo(() => stringsToSelectOptions(companies), [companies]);
  const sectorOptions = useMemo(() => stringsToSelectOptions(sectors), [sectors]);
  const positionOptions = useMemo(() => stringsToSelectOptions(positions), [positions]);
  const costCenterOptions = useMemo(() => stringsToSelectOptions(costCenters), [costCenters]);
  const tomadorOptions = useMemo(() => stringsToSelectOptions(TOMADORES_LIST), []);
  const bankOptions = useMemo(() => stringsToSelectOptions(banks), [banks]);
  const accountTypeOptions = useMemo(() => stringsToSelectOptions(accountTypes), [accountTypes]);
  const pixKeyTypeOptions = useMemo(() => stringsToSelectOptions(pixKeyTypes), [pixKeyTypes]);

  // Etapas do formulário
  const steps = [
    { id: 1, title: 'Dados Pessoais', icon: User },
    { id: 2, title: 'Dados Profissionais', icon: Briefcase },
    { id: 3, title: 'Valores e Adicionais', icon: DollarSign },
    { id: 4, title: 'Dados Bancários', icon: CreditCard },
    { id: 5, title: 'Horário de Trabalho', icon: Clock }
  ];

  const queryClient = useQueryClient();
  const isValidCPF = (cpf: string): boolean => {
    if (cpf.length !== 11) return false;

    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    // Calcular primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9))) return false;

    // Calcular segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10))) return false;

    return true;
  };

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      // Converter data de nascimento para ISO se estiver no formato brasileiro
      const birthDateISO = data.birthDate && data.birthDate.includes('/') 
        ? convertDateToISO(data.birthDate) 
        : data.birthDate;

      const employeeData = {
        employeeId: data.employeeId,
        department: data.sector,
        position: data.position,
        hireDate: `${data.hireDate}T${data.hireTime}:00`,
        birthDate: birthDateISO || null,
        salary: parseCurrencyBRToNumber(data.salary),
        isRemote: data.isRemote,
        workSchedule: {
          startTime: data.workStartTime,
          endTime: data.workEndTime,
          lunchStartTime: data.lunchStartTime,
          lunchEndTime: data.lunchEndTime,
          workDays: [1, 2, 3, 4, 5], // Segunda a sexta
          toleranceMinutes: parseInt(data.toleranceMinutes)
        },
        costCenter: data.costCenter,
        client: data.client,
        dailyFoodVoucher: parseFloat(data.dailyFoodVoucher),
        dailyTransportVoucher: parseFloat(data.dailyTransportVoucher),
        allowedLocations: [],
        // Novos campos
          company: data.company,
        bank: data.bank,
        accountType: data.accountType,
        agency: data.agency,
        operation: data.operation.trim() || 'N/A',
        account: data.account,
        digit: data.digit,
        pixKeyType: data.pixKeyType,
        pixKey: data.pixKey,
        // Novos campos - Modalidade e Adicionais
        modality: data.modality || null,
        familySalary: data.familySalary ? parseCurrencyBRToNumber(data.familySalary) : 0,
        dangerPay: data.dangerPay ? parseFloat(data.dangerPay) : 0,
        unhealthyPay: data.unhealthyPay ? parseFloat(data.unhealthyPay) : 0,
        fixedAdjustments: data.fixedAdjustments ? parseCurrencyBRToNumber(data.fixedAdjustments) : 0,

        // Novos campos - Polo e Categoria Financeira
        polo: data.polo || null,
        categoriaFinanceira: data.categoriaFinanceira || null,
        
        // Campo para controlar se precisa bater ponto
        requiresTimeClock: data.requiresTimeClock !== undefined ? data.requiresTimeClock : true
      };

      const response = await api.post('/users', {
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        password: data.password,
        role: 'EMPLOYEE', // Sempre criar como funcionário
        employeeData
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Funcionário criado com sucesso!');
      onClose();
    },
    onError: (error: any) => {
      console.error('Erro ao criar funcionário:', error);

      // Limpar mensagem de aviso anterior
      setWarningMessage('');

      // Tratar erros específicos do backend
      if (error.response?.data?.message) {
        const message = error.response.data.message;

        if (message.includes('Usuário já existe com este email ou CPF')) {
          setErrors({ 
            email: 'Este email já está em uso', 
            cpf: 'Este CPF já está em uso' 
          });
          setWarningMessage('⚠️ Este email ou CPF já está cadastrado no sistema. Verifique os dados e tente novamente.');
          toast.error('Email ou CPF já cadastrado no sistema');
        } else if (message.includes('email') || message.includes('Email')) {
          setErrors({ email: 'Este email já está em uso' });
          setWarningMessage('⚠️ Este email já está cadastrado no sistema. Por favor, use um email diferente.');
          toast.error('Email já cadastrado no sistema');
        } else if (message.includes('cpf') || message.includes('CPF')) {
          setErrors({ cpf: 'Este CPF já está em uso' });
          setWarningMessage('⚠️ Este CPF já está cadastrado no sistema. Por favor, verifique o número digitado.');
          toast.error('CPF já cadastrado no sistema');
        } else if (message.includes('já existe') || message.includes('já está em uso')) {
          setWarningMessage('⚠️ Dados já cadastrados no sistema. Verifique email e CPF.');
          toast.error('Dados já cadastrados no sistema');
        } else {
          setWarningMessage(`⚠️ ${message}`);
          toast.error(message);
        }
      } else {
        setWarningMessage('⚠️ Erro ao criar funcionário. Tente novamente.');
        toast.error('Erro ao criar funcionário. Tente novamente.');
      }
    }
  });

  // Função para validar uma etapa específica
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      // Validação dos Dados Pessoais
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';
    else if (errors.email && errors.email.includes('já está em uso')) {
      // Manter o erro de email já em uso se existir
      newErrors.email = errors.email;
    }

    if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório';
    else {
      const cpfNumbers = formData.cpf.replace(/\D/g, '');
      if (cpfNumbers.length !== 11) {
        newErrors.cpf = 'CPF deve ter 11 dígitos';
      } else if (!isValidCPF(cpfNumbers)) {
        newErrors.cpf = 'CPF inválido';
      } else if (errors.cpf && errors.cpf.includes('já está em uso')) {
        // Manter o erro de CPF já em uso se existir
        newErrors.cpf = errors.cpf;
      }
    }
      
      if (!formData.password.trim()) newErrors.password = 'Senha é obrigatória';
      else if (formData.password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
      
      if (!confirmPassword.trim()) newErrors.confirmPassword = 'Confirmação de senha é obrigatória';
      else if (formData.password !== confirmPassword) newErrors.confirmPassword = 'As senhas não coincidem';
      
      if (!formData.birthDate.trim()) newErrors.birthDate = 'Data de nascimento é obrigatória';
      else {
        // Converter formato brasileiro para ISO se necessário
        const dateToValidate = formData.birthDate.includes('/') 
          ? convertDateToISO(formData.birthDate) 
          : formData.birthDate;
        
        if (!dateToValidate.match(/^\d{4}-\d{2}-\d{2}$/) || isNaN(new Date(dateToValidate).getTime())) {
          newErrors.birthDate = 'Data de nascimento inválida';
        }
      }
    } else if (step === 2) {
      // Validação dos Dados Profissionais
      if (!formData.sector.trim()) {
        newErrors.sector = 'Setor é obrigatório';
      } else if (!sectors.includes(formData.sector)) {
        newErrors.sector = 'Selecione um setor válido da lista';
      }
      
      if (!formData.position.trim()) {
        newErrors.position = 'Cargo é obrigatório';
      } else if (!positions.includes(formData.position)) {
        newErrors.position = 'Selecione um cargo válido da lista';
      }
      
      if (!formData.hireDate.trim()) newErrors.hireDate = 'Data de contratação é obrigatória';
      else if (isNaN(new Date(formData.hireDate).getTime())) {
        newErrors.hireDate = 'Data de contratação inválida';
      }
      
      if (!formData.costCenter.trim()) {
        newErrors.costCenter = 'Centro de custo é obrigatório';
      } else if (!costCentersList.includes(formData.costCenter)) {
        newErrors.costCenter = 'Selecione um centro de custo válido da lista';
      }
      
      if (!formData.client.trim()) {
        newErrors.client = 'Tomador é obrigatório';
      } else if (!TOMADORES_LIST.includes(formData.client)) {
        newErrors.client = 'Selecione um tomador válido da lista';
      }
      
      if (!formData.company.trim()) {
        newErrors.company = 'Empresa é obrigatória';
      } else if (!companies.includes(formData.company)) {
        newErrors.company = 'Selecione uma empresa válida da lista';
      }
      
      if (!formData.modality.trim()) newErrors.modality = 'Modalidade é obrigatória';
      if (!formData.polo.trim()) newErrors.polo = 'Polo é obrigatório';
      if (!formData.categoriaFinanceira.trim()) newErrors.categoriaFinanceira = 'Categoria Financeira é obrigatória';
    } else if (step === 3) {
      // Validação dos Valores e Adicionais
      if (!formData.salary.trim()) newErrors.salary = 'Salário é obrigatório';
      else {
        const salaryValue = parseCurrencyBRToNumber(formData.salary);
        if (isNaN(salaryValue) || salaryValue <= 0) {
          newErrors.salary = 'Salário deve ser um valor válido';
        }
      }
      
      if (!formData.dailyFoodVoucher.trim()) newErrors.dailyFoodVoucher = 'Vale Alimentação é obrigatório';
      else {
        const vaValue = parseCurrencyBRToNumber(formData.dailyFoodVoucher);
        if (isNaN(vaValue) || vaValue < 0) {
          newErrors.dailyFoodVoucher = 'Vale Alimentação deve ser um valor válido';
        }
      }
      
      if (!formData.dailyTransportVoucher.trim()) newErrors.dailyTransportVoucher = 'Vale Transporte é obrigatório';
      else {
        const vtValue = parseCurrencyBRToNumber(formData.dailyTransportVoucher);
        if (isNaN(vtValue) || vtValue < 0) {
          newErrors.dailyTransportVoucher = 'Vale Transporte deve ser um valor válido';
        }
      }
      
      if (!formData.familySalary.trim()) newErrors.familySalary = 'Salário Família é obrigatório';
      else {
        const familySalaryValue = parseCurrencyBRToNumber(formData.familySalary);
        if (isNaN(familySalaryValue) || familySalaryValue < 0) {
          newErrors.familySalary = 'Salário Família deve ser um valor válido';
        }
      }
      
      if (!formData.dangerPay.trim()) newErrors.dangerPay = 'Periculosidade é obrigatória';
      if (!formData.unhealthyPay.trim()) newErrors.unhealthyPay = 'Insalubridade é obrigatória';
    } else if (step === 4) {
      // Validação dos Dados Bancários
      if (!formData.bank.trim()) {
        newErrors.bank = 'Banco é obrigatório';
      } else if (!banks.includes(formData.bank)) {
        newErrors.bank = 'Selecione um banco válido da lista';
      }
      
      if (!formData.accountType.trim()) newErrors.accountType = 'Tipo de conta é obrigatório';
      if (!formData.agency.trim()) newErrors.agency = 'Agência é obrigatória';
      if (!formData.account.trim()) newErrors.account = 'Conta é obrigatória';
      if (!formData.digit.trim()) newErrors.digit = 'Dígito é obrigatório';
      
      if (!formData.pixKeyType.trim()) newErrors.pixKeyType = 'Tipo de chave PIX é obrigatório';
      if (!formData.pixKey.trim()) newErrors.pixKey = 'Chave PIX é obrigatória';
    } else if (step === 5) {
      // Validação dos Horários
      if (!formData.workStartTime.trim()) newErrors.workStartTime = 'Horário de início é obrigatório';
      if (!formData.workEndTime.trim()) newErrors.workEndTime = 'Horário de fim é obrigatório';
      if (!formData.lunchStartTime.trim()) newErrors.lunchStartTime = 'Horário de início do almoço é obrigatório';
      if (!formData.lunchEndTime.trim()) newErrors.lunchEndTime = 'Horário de fim do almoço é obrigatório';
      if (!formData.toleranceMinutes.trim()) newErrors.toleranceMinutes = 'Tolerância é obrigatória';
      else if (isNaN(parseInt(formData.toleranceMinutes)) || parseInt(formData.toleranceMinutes) < 0) {
        newErrors.toleranceMinutes = 'Tolerância deve ser um número válido';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Funções de navegação entre etapas
  const nextStep = () => {
    // Verificar se há erro de email já em uso antes de validar
    if (errors.email && errors.email.includes('já está em uso')) {
      toast.error('Não é possível avançar: Este email já está em uso');
      return;
    }
    
    // Verificar se há erro de CPF já em uso antes de validar
    if (errors.cpf && errors.cpf.includes('já está em uso')) {
      toast.error('Não é possível avançar: Este CPF já está em uso');
      return;
    }
    
    const isValid = validateStep(currentStep);
    if (isValid) {
      if (currentStep < steps.length) {
        setCurrentStep(currentStep + 1);
        // Scroll para o topo da nova etapa
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      // A validação já definiu os erros, apenas mostrar mensagem
      toast.error('Por favor, preencha todos os campos obrigatórios corretamente');
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      // Limpar erros ao voltar
      setErrors({});
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';
    else if (errors.email && errors.email.includes('já está em uso')) {
      // Manter o erro de email já em uso se existir
      newErrors.email = errors.email;
    }
    
    if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório';
    else {
      const cpfNumbers = formData.cpf.replace(/\D/g, '');
      if (cpfNumbers.length !== 11) {
        newErrors.cpf = 'CPF deve ter 11 dígitos';
      } else if (!isValidCPF(cpfNumbers)) {
        newErrors.cpf = 'CPF inválido';
      } else if (errors.cpf && errors.cpf.includes('já está em uso')) {
        // Manter o erro de CPF já em uso se existir
        newErrors.cpf = errors.cpf;
      }
    }
    
    if (!formData.password.trim()) newErrors.password = 'Senha é obrigatória';
    else if (formData.password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';

    if (!confirmPassword.trim()) newErrors.confirmPassword = 'Confirmação de senha é obrigatória';
    else if (formData.password !== confirmPassword) newErrors.confirmPassword = 'As senhas não coincidem';

    // Matrícula é gerada automaticamente, não precisa validar

    if (!formData.sector.trim()) {
      newErrors.sector = 'Setor é obrigatório';
    } else if (!sectors.includes(formData.sector)) {
      newErrors.sector = 'Selecione um setor válido da lista';
    }

    // Validação do cargo - verifica se está vazio ou se o texto digitado não corresponde a nenhum cargo
    if (!formData.position.trim()) {
      newErrors.position = 'Cargo é obrigatório';
    } else if (!positions.includes(formData.position)) {
      newErrors.position = 'Selecione um cargo válido da lista';
    }

    if (!formData.hireDate.trim()) newErrors.hireDate = 'Data de contratação é obrigatória';
    else if (isNaN(new Date(formData.hireDate).getTime())) {
      newErrors.hireDate = 'Data de contratação inválida';
    }
    if (!formData.salary.trim()) newErrors.salary = 'Salário é obrigatório';
    else {
      const salaryValue = parseCurrencyBRToNumber(formData.salary);
      if (isNaN(salaryValue) || salaryValue <= 0) {
        newErrors.salary = 'Salário deve ser um valor válido';
      }
    }

    // Validação dos campos VA e VT
    if (!formData.dailyFoodVoucher.trim()) newErrors.dailyFoodVoucher = 'Vale Alimentação é obrigatório';
    else {
      const vaValue = parseCurrencyBRToNumber(formData.dailyFoodVoucher);
      if (isNaN(vaValue) || vaValue < 0) {
        newErrors.dailyFoodVoucher = 'Vale Alimentação deve ser um valor válido';
      }
    }

    if (!formData.dailyTransportVoucher.trim()) newErrors.dailyTransportVoucher = 'Vale Transporte é obrigatório';
    else {
      const vtValue = parseCurrencyBRToNumber(formData.dailyTransportVoucher);
      if (isNaN(vtValue) || vtValue < 0) {
        newErrors.dailyTransportVoucher = 'Vale Transporte deve ser um valor válido';
      }
    }

    // Validação dos novos campos
    if (!formData.modality.trim()) newErrors.modality = 'Modalidade é obrigatória';
    if (!formData.polo.trim()) newErrors.polo = 'Polo é obrigatório';
    if (!formData.categoriaFinanceira.trim()) newErrors.categoriaFinanceira = 'Categoria Financeira é obrigatória';

    if (!formData.familySalary.trim()) newErrors.familySalary = 'Salário Família é obrigatório';
    else {
      const familySalaryValue = parseCurrencyBRToNumber(formData.familySalary);
      if (isNaN(familySalaryValue) || familySalaryValue < 0) {
        newErrors.familySalary = 'Salário Família deve ser um valor válido';
      }
    }

    if (!formData.dangerPay.trim()) newErrors.dangerPay = 'Periculosidade é obrigatória';

    if (!formData.unhealthyPay.trim()) newErrors.unhealthyPay = 'Insalubridade é obrigatória';

    // Validações adicionais para campos obrigatórios
    if (!formData.birthDate.trim()) newErrors.birthDate = 'Data de nascimento é obrigatória';
    else {
      // Converter formato brasileiro para ISO se necessário
      const dateToValidate = formData.birthDate.includes('/') 
        ? convertDateToISO(formData.birthDate) 
        : formData.birthDate;

      if (!dateToValidate.match(/^\d{4}-\d{2}-\d{2}$/) || isNaN(new Date(dateToValidate).getTime())) {
      newErrors.birthDate = 'Data de nascimento inválida';
      }
    }

    if (!formData.costCenter.trim()) {
      newErrors.costCenter = 'Centro de custo é obrigatório';
    } else if (!costCentersList.includes(formData.costCenter)) {
      newErrors.costCenter = 'Selecione um centro de custo válido da lista';
    }

    // Validação do tomador - verifica se está vazio ou se o texto digitado não corresponde a nenhum tomador
    if (!formData.client.trim()) {
      newErrors.client = 'Tomador é obrigatório';
    } else if (!TOMADORES_LIST.includes(formData.client)) {
      newErrors.client = 'Selecione um tomador válido da lista';
    }

    // Validação da empresa - verifica se está vazio ou se o texto digitado não corresponde a nenhuma empresa
    if (!formData.company.trim()) {
      newErrors.company = 'Empresa é obrigatória';
    } else if (!companies.includes(formData.company)) {
      newErrors.company = 'Selecione uma empresa válida da lista';
    }

    // Validação do banco - verifica se está vazio ou se o texto digitado não corresponde a nenhum banco
    if (!formData.bank.trim()) {
      newErrors.bank = 'Banco é obrigatório';
    } else if (!banks.includes(formData.bank)) {
      newErrors.bank = 'Selecione um banco válido da lista';
    }

    if (!formData.accountType.trim()) newErrors.accountType = 'Tipo de conta é obrigatório';
    if (!formData.agency.trim()) newErrors.agency = 'Agência é obrigatória';
    if (!formData.account.trim()) newErrors.account = 'Conta é obrigatória';
    if (!formData.digit.trim()) newErrors.digit = 'Dígito é obrigatório';

    // Validações dos dados PIX
    if (!formData.pixKeyType.trim()) newErrors.pixKeyType = 'Tipo de chave PIX é obrigatório';
    if (!formData.pixKey.trim()) newErrors.pixKey = 'Chave PIX é obrigatória';

    // Validações dos horários de trabalho
    if (!formData.workStartTime.trim()) newErrors.workStartTime = 'Horário de início é obrigatório';
    if (!formData.workEndTime.trim()) newErrors.workEndTime = 'Horário de fim é obrigatório';
    if (!formData.lunchStartTime.trim()) newErrors.lunchStartTime = 'Horário de início do almoço é obrigatório';
    if (!formData.lunchEndTime.trim()) newErrors.lunchEndTime = 'Horário de fim do almoço é obrigatório';
    if (!formData.toleranceMinutes.trim()) newErrors.toleranceMinutes = 'Tolerância é obrigatória';
    else if (isNaN(parseInt(formData.toleranceMinutes)) || parseInt(formData.toleranceMinutes) < 0) {
      newErrors.toleranceMinutes = 'Tolerância deve ser um número válido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verificar se há erro de email já em uso antes de validar
    if (errors.email && errors.email.includes('já está em uso')) {
      toast.error('Não é possível salvar: Este email já está em uso');
      return;
    }

    // Verificar se há erro de CPF já em uso antes de validar
    if (errors.cpf && errors.cpf.includes('já está em uso')) {
      toast.error('Não é possível salvar: Este CPF já está cadastrado');
      return;
    }

    // Validação final de CPF antes de criar
    const cpfNumbers = formData.cpf.replace(/\D/g, '');
    if (cpfNumbers.length === 11 && isValidCPF(cpfNumbers)) {
      setIsCheckingCpf(true);
      try {
        const response = await api.get('/users/check-cpf', {
          params: { cpf: cpfNumbers }
        });

        if (response.data.exists) {
          setErrors(prev => ({
            ...prev,
            cpf: 'Este CPF já está em uso'
          }));
          toast.error('Este CPF já está cadastrado no sistema');
          setIsCheckingCpf(false);
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar CPF:', error);
        // Continuar mesmo se a verificação falhar (não bloquear criação)
      } finally {
        setIsCheckingCpf(false);
      }
    }
    
    // Verificar se há erro de CPF já em uso antes de validar
    if (errors.cpf && errors.cpf.includes('já está em uso')) {
      toast.error('Não é possível salvar: Este CPF já está em uso');
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await createEmployeeMutation.mutateAsync(formData);
    } catch (error) {
      console.error('Erro ao criar funcionário:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof EmployeeFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    // Limpar mensagem de aviso quando usuário começar a digitar
    if (warningMessage) {
      setWarningMessage('');
    }
  };

  // Função para formatar CPF
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  // Função para verificar se o CPF já existe
  const checkCpfExists = async (cpf: string) => {
    // Remover formatação do CPF
    const cpfNumbers = cpf.replace(/\D/g, '');
    
    // Só verificar se o CPF tiver 11 dígitos e for válido
    if (cpfNumbers.length !== 11 || !isValidCPF(cpfNumbers)) {
      // Limpar erro se o CPF não estiver completo ou for inválido
      if (errors.cpf && errors.cpf.includes('já está em uso')) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.cpf;
          return newErrors;
        });
      }
      return;
    }

    setIsCheckingCpf(true);
    try {
      const response = await api.get('/users/check-cpf', {
        params: { cpf: cpfNumbers }
      });

      if (response.data.exists) {
        setErrors(prev => ({
          ...prev,
          cpf: 'Este CPF já está em uso'
        }));
      } else {
        // Limpar erro se o CPF não existir
        if (errors.cpf && errors.cpf.includes('já está em uso')) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.cpf;
            return newErrors;
          });
        }
      }
    } catch (error) {
      console.error('Erro ao verificar CPF:', error);
      // Não mostrar erro para o usuário se a verificação falhar
    } finally {
      setIsCheckingCpf(false);
    }
  };

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    handleInputChange('cpf', formatted);
    
    // Verificar CPF imediatamente quando tiver 11 dígitos
    const cpfNumbers = formatted.replace(/\D/g, '');
    if (cpfNumbers.length === 11) {
      // Validar CPF inválido primeiro
      if (!isValidCPF(cpfNumbers)) {
        setErrors(prev => ({
          ...prev,
          cpf: 'CPF inválido'
        }));
      } else {
        // Se o CPF for válido, limpar erro de inválido e verificar se já existe
        if (errors.cpf && errors.cpf === 'CPF inválido') {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.cpf;
            return newErrors;
          });
        }
        // Verificar imediatamente após digitar o último dígito
        checkCpfExists(formatted);
      }
    } else {
      // Limpar erros se o CPF não estiver completo
      if (errors.cpf && (errors.cpf.includes('já está em uso') || errors.cpf === 'CPF inválido')) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.cpf;
          return newErrors;
        });
      }
    }
  };

  // Função para validar formato de email
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Função para verificar se o email já existe
  const checkEmailExists = async (email: string) => {
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

  // Função para formatar data (dd/mm/aaaa)
  // Função para converter data formatada (dd/mm/aaaa) para formato ISO (aaaa-mm-dd)
  const convertDateToISO = (formattedDate: string): string => {
    if (formattedDate.includes('-') && formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Já está no formato ISO
      return formattedDate;
    }
    const parts = formattedDate.split('/');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      // Formato brasileiro: dd/mm/aaaa -> aaaa-mm-dd
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return formattedDate;
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Cadastrar Novo Funcionário
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Mensagem de aviso */}
        {warningMessage && (
          <div className="mx-5 mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 sm:mx-6 dark:border-yellow-800 dark:bg-yellow-900/30">
            <div className="flex items-start space-x-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500 dark:text-yellow-400" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Atenção</p>
                <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">{warningMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Indicador de Etapas */}
        <div className="px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-1 sm:gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <React.Fragment key={step.id}>
                  <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        isActive
                          ? 'border-red-600 bg-red-600 text-white shadow-sm dark:border-red-500 dark:bg-red-500'
                          : isCompleted
                            ? 'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600'
                            : 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={`mt-2 max-w-[5.5rem] text-[11px] font-medium leading-tight sm:max-w-none sm:text-xs ${
                        isActive
                          ? 'text-red-600 dark:text-red-400'
                          : isCompleted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`mt-5 h-px min-w-[0.5rem] flex-1 self-start transition-colors ${
                        isCompleted ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          // Só permite submit se estiver na última etapa
          if (currentStep === steps.length) {
            handleSubmit(e);
          }
        }} className="space-y-6 px-5 pb-6 sm:px-6">
          {/* Etapa 1: Dados Pessoais */}
          {currentStep === 1 && (
          <div className="space-y-6">
            <div className={FIELD_GRID_CLS}>
              <div>
                <label className={FIELD_LABEL_CLS}>
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={fieldInputCls(Boolean(errors.name))}
                  placeholder="Nome completo do funcionário"
                />
                {errors.name && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className={FIELD_LABEL_CLS}>
                  Email *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 dark:text-gray-100 dark:placeholder-gray-500 ${
                      errors.email
                        ? 'border-red-500 bg-white focus:ring-red-500 dark:border-red-400 dark:bg-gray-800'
                        : !isCheckingEmail && formData.email && isValidEmail(formData.email.trim()) && !errors.email
                          ? 'border-green-500 bg-green-50 focus:ring-green-500 dark:border-green-400 dark:bg-green-900/20'
                          : 'border-gray-300 bg-white focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800'
                    }`}
                    placeholder="email@empresa.com"
                  />
                  {isCheckingEmail && formData.email && isValidEmail(formData.email.trim()) && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                      <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                    </div>
                  )}
                  {!isCheckingEmail && formData.email && isValidEmail(formData.email.trim()) && !errors.email && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                      <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    </div>
                  )}
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.email}</p>
                )}
              </div>

              <div>
                <label className={FIELD_LABEL_CLS}>
                  CPF *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.cpf}
                    onChange={(e) => handleCPFChange(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 dark:text-gray-100 dark:placeholder-gray-500 ${
                      errors.cpf
                        ? 'border-red-500 bg-white focus:ring-red-500 dark:border-red-400 dark:bg-gray-800'
                        : !isCheckingCpf && formData.cpf.replace(/\D/g, '').length === 11 && isValidCPF(formData.cpf.replace(/\D/g, '')) && !errors.cpf
                          ? 'border-green-500 bg-green-50 focus:ring-green-500 dark:border-green-400 dark:bg-green-900/20'
                          : 'border-gray-300 bg-white focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800'
                    }`}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                  {isCheckingCpf && formData.cpf.replace(/\D/g, '').length === 11 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                      <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                    </div>
                  )}
                  {!isCheckingCpf && formData.cpf.replace(/\D/g, '').length === 11 && isValidCPF(formData.cpf.replace(/\D/g, '')) && !errors.cpf && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                      <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    </div>
                  )}
                </div>
                {errors.cpf && (
                  <p className="mt-1 flex items-center text-xs text-red-500 dark:text-red-400">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    {errors.cpf}
                  </p>
                )}
              </div>

              <div>
                <label className={FIELD_LABEL_CLS}>
                  Data de Nascimento *
                </label>
                <DatePickerField
                  value={
                    formData.birthDate.includes('/')
                      ? convertDateToISO(formData.birthDate)
                      : formData.birthDate
                  }
                  onChange={(value) => {
                    setFormData((prev) => ({ ...prev, birthDate: value }));
                    if (errors.birthDate) {
                      setErrors((prev) => ({ ...prev, birthDate: '' }));
                    }
                  }}
                  placeholder="dd/mm/aaaa"
                  aria-label="Data de nascimento"
                  className={dateFieldErrorCls(Boolean(errors.birthDate))}
                />
                {errors.birthDate && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.birthDate}</p>}
              </div>

              <div>
                <label className={FIELD_LABEL_CLS}>
                  Senha Temporária *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={fieldInputCls(Boolean(errors.password), 'pr-10')}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.password}</p>}
              </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirmar Senha *
                  </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) {
                        setErrors(prev => ({ ...prev, confirmPassword: '' }));
                      }
                    }}
                    className={fieldInputCls(Boolean(errors.confirmPassword), "pr-10")}
                    placeholder="Confirme a senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>
          )}

          {/* Etapa 2: Dados Profissionais */}
          {currentStep === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {/* Linha 1: Empresa | Polo */}
              {/* Campo Empresa */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Empresa *
                  </label>

                <StringSingleSelectDropdown
                  value={formData.company}
                  onChange={(company) => handleInputChange('company', company)}
                  options={companyOptions}
                  placeholder="Digite para buscar a empresa..."
                  searchPlaceholder="Pesquisar empresa..."
                  className={selectTriggerErrorCls(Boolean(errors.company))}
                />

                {errors.company && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.company}</p>
                )}
            </div>

              {/* Campo Polo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Polo *
                </label>
                <StringSingleSelectDropdown
                  value={formData.polo}
                  onChange={(polo) => handleInputChange('polo', polo)}
                  options={EMPLOYEE_POLO_OPTIONS}
                  placeholder="Selecione o polo"
                  searchPlaceholder="Pesquisar polo..."
                  className={selectTriggerErrorCls(Boolean(errors.polo))}
                />
                {errors.polo && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {errors.polo}
                  </p>
                )}
              </div>

              {/* Linha 2: Setor | Cargo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Setor *
                </label>

                <StringSingleSelectDropdown
                  value={formData.sector}
                  onChange={(sector) => handleInputChange('sector', sector)}
                  options={sectorOptions}
                  placeholder="Digite para buscar o setor..."
                  searchPlaceholder="Pesquisar setor..."
                  className={selectTriggerErrorCls(Boolean(errors.sector))}
                />

                {errors.sector && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.sector}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Cargo *
                </label>

                <StringSingleSelectDropdown
                  value={formData.position}
                  onChange={(position) => handleInputChange('position', position)}
                  options={positionOptions}
                  placeholder="Digite para buscar o cargo..."
                  searchPlaceholder="Pesquisar cargo..."
                  className={selectTriggerErrorCls(Boolean(errors.position))}
                />

                {errors.position && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.position}</p>
                )}
              </div>

              {/* Linha 3: Centro de Custo | Tomador */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Centro de Custo *
                </label>

                <StringSingleSelectDropdown
                  value={formData.costCenter}
                  onChange={(costCenter) => handleInputChange('costCenter', costCenter)}
                  options={costCenterOptions}
                  placeholder="Digite para buscar o centro de custo..."
                  searchPlaceholder="Pesquisar centro de custo..."
                  className={selectTriggerErrorCls(Boolean(errors.costCenter))}
                />

                {errors.costCenter && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.costCenter}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tomador *
                </label>

                <StringSingleSelectDropdown
                  value={formData.client}
                  onChange={(client) => handleInputChange('client', client)}
                  options={tomadorOptions}
                  placeholder="Digite para buscar o tomador..."
                  searchPlaceholder="Pesquisar tomador..."
                  className={selectTriggerErrorCls(Boolean(errors.client))}
                />

                {errors.client && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.client}</p>
                )}
              </div>

              {/* Linha 4: Modalidade | Categoria Financeira */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Modalidade *
                </label>
                <StringSingleSelectDropdown
                  value={formData.modality}
                  onChange={(modality) => handleInputChange('modality', modality)}
                  options={EMPLOYEE_MODALITY_OPTIONS}
                  placeholder="Selecione a modalidade"
                  searchPlaceholder="Pesquisar modalidade..."
                  className={selectTriggerErrorCls(Boolean(errors.modality))}
                />
                {errors.modality && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {errors.modality}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Categoria Financeira *
                </label>
                <StringSingleSelectDropdown
                  value={formData.categoriaFinanceira}
                  onChange={(categoriaFinanceira) => handleInputChange('categoriaFinanceira', categoriaFinanceira)}
                  options={EMPLOYEE_CATEGORIA_FINANCEIRA_OPTIONS}
                  placeholder="Selecione a categoria"
                  searchPlaceholder="Pesquisar categoria..."
                  className={selectTriggerErrorCls(Boolean(errors.categoriaFinanceira))}
                />
                {errors.categoriaFinanceira && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {errors.categoriaFinanceira}
                  </p>
                )}
              </div>

              {/* Linha 5: Data de Admissão | Trabalho Remoto */}
              <div>
                <label className={FIELD_LABEL_CLS}>
                  Data de Admissão *
                </label>
                <DatePickerField
                  value={formData.hireDate}
                  onChange={(value) => handleInputChange('hireDate', value)}
                  placeholder="dd/mm/aaaa"
                  aria-label="Data de admissão"
                  className={dateFieldErrorCls(Boolean(errors.hireDate))}
                />
                {errors.hireDate && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.hireDate}</p>
                )}
              </div>

              <div className="flex h-10 items-center self-end">
                <FormCheckbox
                  id="isRemote"
                  checked={formData.isRemote}
                  onChange={(checked) => handleInputChange('isRemote', checked)}
                  label="Trabalho Remoto"
                />
              </div>
              </div>
            </div>
          )}

          {/* Etapa 3: Valores e Adicionais */}
          {currentStep === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Salário (R$) *
                  </label>
                  <input
                    type="text"
                    value={formData.salary}
                    onChange={(e) => setFormData(prev => ({ ...prev, salary: maskCurrencyInput(e.target.value) }))}
                    inputMode="numeric"
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.salary ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="R$ 0,00"
                  />
                  {errors.salary && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.salary}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Salário Família (R$)
                  </label>
                  <input
                    type="text"
                    value={formData.familySalary}
                    onChange={(e) => setFormData(prev => ({ ...prev, familySalary: maskCurrencyInput(e.target.value) }))}
                    inputMode="numeric"
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.familySalary ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="R$ 0,00"
                  />
                  {errors.familySalary && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.familySalary}
                    </p>
                  )}
                </div>

                <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Vale Alimentação Diário (R$) *
                </label>
                <input
                    type="text"
                    value={formData.dailyFoodVoucher}
                    onChange={(e) => setFormData(prev => ({ ...prev, dailyFoodVoucher: maskCurrencyInput(e.target.value) }))}
                    inputMode="numeric"
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.dailyFoodVoucher ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="R$ 0,00"
                  />
                  {errors.dailyFoodVoucher && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.dailyFoodVoucher}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Vale Transporte Diário (R$) *
                  </label>
                  <input
                    type="text"
                    value={formData.dailyTransportVoucher}
                    onChange={(e) => setFormData(prev => ({ ...prev, dailyTransportVoucher: maskCurrencyInput(e.target.value) }))}
                    inputMode="numeric"
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.dailyTransportVoucher ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="R$ 0,00"
                  />
                  {errors.dailyTransportVoucher && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.dailyTransportVoucher}
                    </p>
                  )}
                </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Acréscimos Fixos (R$)
                </label>
                <input
                  type="text"
                  value={formData.fixedAdjustments}
                  onChange={(e) => setFormData(prev => ({ ...prev, fixedAdjustments: maskCurrencyInput(e.target.value) }))}
                  inputMode="numeric"
                  className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                    errors.fixedAdjustments ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="R$ 0,00"
                />
                  {errors.fixedAdjustments && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.fixedAdjustments}
                    </p>
                  )}
              </div>

              <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Periculosidade
                  </label>
                  <StringSingleSelectDropdown
                    value={formData.dangerPay}
                    onChange={(dangerPay) => handleInputChange('dangerPay', dangerPay)}
                    options={PERCENT_0_100_STEP5_OPTIONS}
                    placeholder="Selecione a porcentagem"
                    searchPlaceholder="Pesquisar porcentagem..."
                    className={selectTriggerErrorCls(Boolean(errors.dangerPay))}
                  />
                  {errors.dangerPay && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.dangerPay}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Insalubridade
                  </label>
                  <StringSingleSelectDropdown
                    value={formData.unhealthyPay}
                    onChange={(unhealthyPay) => handleInputChange('unhealthyPay', unhealthyPay)}
                    options={PERCENT_0_100_STEP5_OPTIONS}
                    placeholder="Selecione a porcentagem"
                    searchPlaceholder="Pesquisar porcentagem..."
                    className={selectTriggerErrorCls(Boolean(errors.unhealthyPay))}
                  />
                  {errors.unhealthyPay && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.unhealthyPay}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Etapa 4: Dados Bancários */}
          {currentStep === 4 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Banco *
                </label>

                <StringSingleSelectDropdown
                  value={formData.bank}
                  onChange={(bank) => handleInputChange('bank', bank)}
                  options={bankOptions}
                  placeholder="Digite para buscar o banco..."
                  searchPlaceholder="Pesquisar banco..."
                  className={selectTriggerErrorCls(Boolean(errors.bank))}
                />

                {errors.bank && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.bank}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tipo de Conta *
                </label>
                <StringSingleSelectDropdown
                  value={formData.accountType}
                  onChange={(accountType) => handleInputChange('accountType', accountType)}
                  options={accountTypeOptions}
                  placeholder="Selecione o tipo"
                  searchPlaceholder="Pesquisar tipo..."
                  className={selectTriggerErrorCls(Boolean(errors.accountType))}
                />
                {errors.accountType && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.accountType}</p>}
              </div>

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-x-6 gap-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Agência *
                  </label>
                  <input
                    type="text"
                    value={formData.agency}
                    onChange={(e) => handleInputChange('agency', e.target.value)}
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.agency ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="1234"
                  />
                  {errors.agency && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.agency}</p>}
                </div>

                <div>
                  <label className={FIELD_LABEL_CLS}>
                    Operação
                  </label>
                  <input
                    type="text"
                    value={formData.operation}
                    onChange={(e) => handleInputChange('operation', e.target.value)}
                    className={fieldInputCls()}
                    placeholder="N/A"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Conta *
                  </label>
                  <input
                    type="text"
                    value={formData.account}
                    onChange={(e) => handleInputChange('account', e.target.value)}
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.account ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="12345"
                  />
                  {errors.account && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.account}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Dígito *
                  </label>
                  <input
                    type="text"
                    value={formData.digit}
                    onChange={(e) => handleInputChange('digit', e.target.value)}
                    className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                      errors.digit ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="6"
                    maxLength={2}
                  />
                  {errors.digit && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.digit}</p>}
                </div>
              </div>
            </div>

            {/* Dados PIX (continuação da Etapa 4) */}
            <div className="space-y-4 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tipo de Chave *
                </label>
                <StringSingleSelectDropdown
                  value={formData.pixKeyType}
                  onChange={(pixKeyType) => handleInputChange('pixKeyType', pixKeyType)}
                  options={pixKeyTypeOptions}
                  placeholder="Selecione o tipo"
                  searchPlaceholder="Pesquisar tipo..."
                  className={selectTriggerErrorCls(Boolean(errors.pixKeyType))}
                />
                {errors.pixKeyType && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.pixKeyType}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Chave PIX *
                </label>
                <input
                  type="text"
                  value={formData.pixKey}
                  onChange={(e) => handleInputChange('pixKey', e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                    errors.pixKey ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Digite a chave PIX"
                />
                {errors.pixKey && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.pixKey}</p>}
              </div>
            </div>
          </div>
          </div>
          )}

          {/* Etapa 5: Horário de Trabalho */}
          {currentStep === 5 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Início *
                </label>
                <input
                  type="time"
                  value={formData.workStartTime}
                  onChange={(e) => handleInputChange('workStartTime', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Fim *
                </label>
                <input
                  type="time"
                  value={formData.workEndTime}
                  onChange={(e) => handleInputChange('workEndTime', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Início Almoço *
                </label>
                <input
                  type="time"
                  value={formData.lunchStartTime}
                  onChange={(e) => handleInputChange('lunchStartTime', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Fim Almoço *
                </label>
                <input
                  type="time"
                  value={formData.lunchEndTime}
                  onChange={(e) => handleInputChange('lunchEndTime', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Tolerância (minutos) *
              </label>
              <input
                type="number"
                value={formData.toleranceMinutes}
                onChange={(e) => handleInputChange('toleranceMinutes', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100"
                min="0"
                max="60"
              />
            </div>

            {/* Toggle para controlar se precisa bater ponto */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Precisa bater ponto?
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Se desativado, o funcionário não precisará bater ponto e não aparecerá nos relatórios de ponto
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('requiresTimeClock', !formData.requiresTimeClock)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                    formData.requiresTimeClock
                      ? 'bg-red-600 dark:bg-red-500'
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
          </div>
          )}

          {/* Botões de Navegação */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-5 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>

            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Anterior</span>
                </button>
              )}

              {currentStep < steps.length ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:hover:bg-red-500"
                >
                  <span>Próximo</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    // Validar etapa 5 antes de submeter
                    if (validateStep(currentStep)) {
                      handleSubmit(e as any);
                    } else {
                      toast.error('Por favor, preencha todos os campos obrigatórios corretamente');
                    }
                  }}
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Criando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Criar Funcionário</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
        </div>
      </div>

      {/* Modal de Confirmação de Cancelamento */}
      {showCancelConfirm && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleCancelCancel} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
              Cancelar Cadastro?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
              Tem certeza que deseja cancelar o cadastro? Todos os dados preenchidos serão perdidos.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={handleCancelCancel}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
