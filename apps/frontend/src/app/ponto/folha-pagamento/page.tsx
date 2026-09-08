'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { DollarSign, Search, Filter, Download, Calculator, Calendar, Clock, BadgeDollarSign, FileSpreadsheet, Building2, FileText, ChevronDown, ChevronUp, X, ListPlus , RotateCcw, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { PayrollDetailModal } from '@/components/payroll/PayrollDetailModal';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { PayrollEmployee, PayrollFilters, MonthlyPayrollData } from '@/types';
import { 
  DEPARTMENTS_LIST, 
  COMPANIES_LIST, 
  MODALITIES_LIST, 
  BANKS_LIST, 
  ACCOUNT_TYPES_LIST,
  CLIENTS_LIST,
  POLOS_LIST
} from '@/constants/payrollFilters';
import { useCostCenters } from '@/hooks/useCostCenters';
import { CARGOS_LIST } from '@/constants/cargos';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import * as XLSX from 'xlsx';

const MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]);

function filterWithEmpty(emptyLabel: string, items: string[]) {
  return labeledToSelectOptions([
    { value: '', label: emptyLabel },
    ...items.map((item) => ({ value: item, label: item })),
  ]);
}

const DEPARTMENT_FILTER_OPTIONS = filterWithEmpty('Todos os setores', DEPARTMENTS_LIST);
const POSITION_FILTER_OPTIONS = filterWithEmpty('Todos os cargos', CARGOS_LIST);
const COMPANY_FILTER_OPTIONS = filterWithEmpty('Todas as empresas', COMPANIES_LIST);
const CLIENT_FILTER_OPTIONS = filterWithEmpty('Todos os tomadores', CLIENTS_LIST);
const POLO_FILTER_OPTIONS = filterWithEmpty('Todos os polos', POLOS_LIST);
const MODALITY_FILTER_OPTIONS = filterWithEmpty('Todas as modalidades', MODALITIES_LIST);
const BANK_FILTER_OPTIONS = filterWithEmpty('Todos os bancos', BANKS_LIST);
const ACCOUNT_TYPE_FILTER_OPTIONS = filterWithEmpty('Todos os tipos', ACCOUNT_TYPES_LIST);

// Função auxiliar para calcular dias úteis do próximo mês (segunda a sexta, descontando feriados)
// Esta função é um fallback - o ideal é usar o valor do backend que já desconta feriados
function calculateNextMonthWorkingDays(month: number, year: number, holidays: any[] = []): number {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const daysInMonth = new Date(nextYear, nextMonth, 0).getDate();
  
  // Filtrar apenas feriados do próximo mês
  const nextMonthHolidays = holidays.filter((h: any) => {
    const d = new Date(h.date);
    return d.getFullYear() === nextYear && d.getMonth() + 1 === nextMonth;
  });
  
  // Criar um Set com as datas dos feriados do próximo mês no formato YYYY-MM-DD
  const holidaySet = new Set(
    nextMonthHolidays.map((h: any) => {
      const d = new Date(h.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })
  );
  
  let workingDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(nextYear, nextMonth - 1, day);
    const dayOfWeek = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Contar apenas dias úteis (1-5 = segunda a sexta), excluindo sábados, domingos e feriados
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidaySet.has(dateKey)) {
      workingDays++;
    }
  }
  
  return workingDays;
}

export default function FolhaPagamentoPage() {
  const { costCentersList } = useCostCenters();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Obter mês e ano atual
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const [filters, setFilters] = useState<PayrollFilters>({
    search: '',
    department: 'Departamento Pessoal',
    company: '',
    position: '',
    costCenter: '',
    client: '',
    modality: '',
    bank: '',
    accountType: '',
    polo: '',
    month: currentMonth,
    year: currentYear
  });
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true); // Minimizados por padrão

  // Verificar se há token antes de fazer requisições
  const hasToken = typeof window !== 'undefined' && !!(localStorage.getItem('token') || sessionStorage.getItem('token'));

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    enabled: hasToken, // Só executar se houver token
    retry: false, // Não tentar novamente em caso de erro
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  const { data: payrollResponse, isLoading: loadingPayroll, error: payrollError } = useQuery({
    queryKey: ['payroll-monthly', filters],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.department) params.append('department', filters.department);
        if (filters.company) params.append('company', filters.company);
        if (filters.position) params.append('position', filters.position);
        if (filters.costCenter) params.append('costCenter', filters.costCenter);
        if (filters.client) params.append('client', filters.client);
        if (filters.modality) params.append('modality', filters.modality);
        if (filters.bank) params.append('bank', filters.bank);
        if (filters.accountType) params.append('accountType', filters.accountType);
        if (filters.polo) params.append('polo', filters.polo);
        params.append('month', filters.month.toString());
        params.append('year', filters.year.toString());
        
        const res = await api.get(`/payroll/employees?${params.toString()}`);
        console.log('📊 Resposta da API folha de pagamento:', res.data);
        return res.data;
      } catch (error: any) {
        console.error('❌ Erro ao buscar folha de pagamento:', error);
        console.error('❌ Detalhes do erro:', error.response?.data || error.message);
        throw error;
      }
    },
    enabled: hasToken && !!userData, // Só executar se houver token e dados do usuário
    retry: 2,
    retryDelay: 1000,
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  // Buscar feriados do mês
  const { data: holidaysData } = useQuery({
    queryKey: ['holidays', filters.year],
    queryFn: async () => {
      const params: any = { year: filters.year };
      // Não especificar mês para buscar todos os feriados do ano (incluindo próximo mês para cálculo de VA/VT)
      const res = await api.get('/holidays', { params });
      return res.data;
    },
    enabled: hasToken && !!userData, // Só executar se houver token e dados do usuário
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  const holidays = holidaysData?.data || [];

  // Buscar status da folha de pagamento
  const { data: payrollStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['payroll-status', filters.month, filters.year],
    queryFn: async () => {
      const res = await api.get(`/payroll/status?month=${filters.month}&year=${filters.year}`);
      return res.data;
    }
  });

  const isFinalized = payrollStatus?.data?.isFinalized || false;
  const { isDepartmentPessoal, isDepartmentFinanceiro, userPosition } = usePermissions();
  
  // Verificar se o usuário pode finalizar a folha (DP ou Administrador)
  const canFinalizePayroll = isDepartmentPessoal || userPosition === 'Administrador';
  
  // Verificar se o usuário pode reabrir a folha (Financeiro ou Administrador)
  const canReopenPayroll = isDepartmentFinanceiro || userPosition === 'Administrador';

  // Função para finalizar a folha
  const handleFinalizePayroll = async () => {
    if (!confirm('Tem certeza que deseja finalizar esta folha de pagamento? Após finalizar, o setor financeiro poderá processar os pagamentos.')) {
      return;
    }

    try {
      await api.post('/payroll/finalize', {
        month: filters.month,
        year: filters.year
      });
      
      await refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['payroll-status'] });
      alert('Folha de pagamento finalizada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao finalizar folha:', error);
      alert(error.response?.data?.message || 'Erro ao finalizar folha de pagamento. Tente novamente.');
    }
  };

  // Função para reabrir a folha
  const handleReopenPayroll = async () => {
    if (!confirm('Tem certeza que deseja reabrir esta folha de pagamento? O Departamento Pessoal poderá fazer correções.')) {
      return;
    }

    try {
      await api.post('/payroll/reopen', {
        month: filters.month,
        year: filters.year
      });
      
      await refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['payroll-status'] });
      alert('Folha de pagamento reaberta com sucesso! O Departamento Pessoal pode fazer correções.');
    } catch (error: any) {
      console.error('Erro ao reabrir folha:', error);
      alert(error.response?.data?.message || 'Erro ao reabrir folha de pagamento. Tente novamente.');
    }
  };

  // Buscar todas as faltas do período para calcular DSR corretamente
  const { data: absencesData } = useQuery({
    queryKey: ['absences-all', filters.year, filters.month],
    queryFn: async () => {
      const startDate = new Date(filters.year, filters.month - 1, 1);
      const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59);
      
      const res = await api.get(`/time-records?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&type=ABSENCE_JUSTIFIED`);
      
      if (!res.data) return { data: [] };
      return res.data;
    },
    enabled: hasToken && !!userData && !!filters.year && !!filters.month, // Só executar se houver token, dados do usuário e filtros
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  // Criar mapa de faltas por funcionário (employeeId -> array de datas)
  const absencesByEmployee = useMemo(() => {
    const map = new Map<string, Date[]>();
    if (absencesData?.data) {
      absencesData.data.forEach((record: any) => {
        const employeeId = record.employeeId;
        if (!map.has(employeeId)) {
          map.set(employeeId, []);
        }
        map.get(employeeId)!.push(new Date(record.timestamp));
      });
    }
    return map;
  }, [absencesData]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, department: e.target.value }));
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, company: e.target.value }));
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, position: e.target.value }));
  };

  const handleCostCenterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, costCenter: e.target.value }));
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, client: e.target.value }));
  };

  const handlePoloChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, polo: e.target.value }));
  };

  const handleModalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, modality: e.target.value }));
  };

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, bank: e.target.value }));
  };

  const handleAccountTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, accountType: e.target.value }));
  };

  const handleViewDetails = (employee: PayrollEmployee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, month: parseInt(e.target.value) }));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, year: parseInt(e.target.value) }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      department: '',
      company: '',
      position: '',
      costCenter: '',
      client: '',
      modality: '',
      bank: '',
      accountType: '',
      month: currentMonth,
      year: currentYear
    });
  };

  const clearAdvancedFilters = () => {
    setFilters(prev => ({
      ...prev,
      department: '',
      company: '',
      position: '',
      costCenter: '',
      client: '',
      modality: '',
      bank: '',
      accountType: ''
    }));
  };

  // Função auxiliar para converter polo para estado
  const poloToState = (polo?: string | null): string | undefined => {
    if (!polo) return undefined;
    const poloUpper = polo.toUpperCase();
    if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
    if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
    return undefined;
  };

  // Função auxiliar para obter o início da semana (domingo) de uma data
  const getWeekStart = (date: Date): Date => {
    const dateCopy = new Date(date);
    const dayOfWeek = dateCopy.getDay();
    const weekStart = new Date(dateCopy);
    weekStart.setDate(dateCopy.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  };

  // Função auxiliar para calcular DSR por faltas considerando feriados
  // Usa a mesma lógica da modal: considera se as faltas estão na mesma semana ou não
  // - Se faltas estão na mesma semana: conta apenas 1 DSR total pelas faltas
  // - Se faltas estão em semanas diferentes: conta 1 DSR por cada semana com faltas
  // - Cada feriado do mês sempre adiciona 1 DSR (independente da semana)
  const calcularDSRPorFaltas = (
    salarioBase: number, 
    faltas: number, 
    holidays: any[], 
    diasDoMes: number,
    absenceDates?: Date[]
  ): number => {
    if (faltas <= 0) return 0;

    // Verificar quantos feriados úteis há no mês (segunda a sábado)
    const feriadosUteis = holidays.filter((holiday: any) => {
      const holidayDate = new Date(holiday.date);
      const dayOfWeek = holidayDate.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 6; // Segunda a sábado
    });

    // Se temos as datas das faltas, calcular DSR por semana com falta
    if (absenceDates && absenceDates.length > 0 && absenceDates.length === faltas) {
      // Agrupar faltas por semana e contar feriados de cada semana
      const semanasComFaltas = new Map<string, number>(); // semana -> quantidade de faltas
      absenceDates.forEach((absenceDate: Date) => {
        const weekStart = getWeekStart(absenceDate);
        const weekKey = weekStart.toISOString();
        semanasComFaltas.set(weekKey, (semanasComFaltas.get(weekKey) || 0) + 1);
      });

      let totalDSR = 0;

      // Para cada semana com falta, calcular DSR
      semanasComFaltas.forEach((numFaltasNaSemana, weekKey) => {
        const weekStart = new Date(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Fim da semana (sábado)

        // Contar quantos feriados estão nesta semana específica
        const feriadosNaSemana = feriadosUteis.filter((holiday: any) => {
          const holidayDate = new Date(holiday.date);
          return holidayDate >= weekStart && holidayDate <= weekEnd;
        }).length;

        // DSR = 1 pela semana (independente de quantas faltas) + 1 por cada feriado da semana
        // Exemplo: 2 faltas na mesma semana + 1 feriado = 1 DSR (semana) + 1 DSR (feriado) = 2 DSR
        // Exemplo: 1 falta semana 1 (com 1 feriado) + 1 falta semana 2 = 1 DSR (semana 1) + 1 DSR (feriado semana 1) + 1 DSR (semana 2) = 3 DSR
        const dsrDaSemana = 1 + feriadosNaSemana;
        totalDSR += dsrDaSemana;
      });

      return (salarioBase / 30) * totalDSR;
    } else {
      // Fallback: se não temos as datas exatas, assumir que estão em semanas diferentes
      // Contar todos os feriados do mês
      const quantidadeFeriados = feriadosUteis.length;
      // 1 DSR por falta + 1 DSR por cada feriado (assumindo que pode estar na mesma semana)
      const totalDSR = faltas + quantidadeFeriados;
      return (salarioBase / 30) * totalDSR;
    }
  };

  const exportToExcel = async () => {
    if (!payrollData || !Array.isArray(payrollData.employees) || payrollData.employees.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    // Buscar feriados do mês
    let holidays: any[] = [];
    try {
      const params: any = { year: filters.year };
      if (filters.month) params.month = filters.month;
      const res = await api.get('/holidays', { params });
      holidays = res.data?.data || [];
    } catch (error) {
      console.error('Erro ao buscar feriados:', error);
      // Continuar sem feriados se houver erro
    }

    const diasDoMes = new Date(filters.year, filters.month, 0).getDate();

    // Função auxiliar para formatar valores monetários
    const formatCurrency = (value: number): string => {
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Preparar dados para exportação - cada campo em coluna separada
    const exportData = payrollData.employees.map(employee => {
      // Cálculos auxiliares
      const salarioBase = employee.salary;
      const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
      const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
      const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
      // Calcular número de dias do mês para desconto de faltas
      // Usa 30 como padrão (a lista não tem acesso à data de admissão do funcionário)
      const diasParaDesconto = 30; // Padrão
      
      // Calcular número de dias do mês atual (para outros cálculos)
      const diasDoMes = new Date(filters.year, filters.month, 0).getDate();
      
      // Usar valor manual de descontoPorFaltas se existir, senão calcular
      // Usar a mesma fórmula do backend: (salarioBase + periculosidade + insalubridade) / diasParaDesconto * faltas
      const descontoPorFaltasCalculado = diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
      const descontoPorFaltas = (employee.descontoPorFaltas !== null && employee.descontoPorFaltas !== undefined) 
        ? Number(employee.descontoPorFaltas) 
        : descontoPorFaltasCalculado;
      
      // Buscar feriados do estado do funcionário
      const employeeState = poloToState(employee.polo);
      const employeeHolidays = employeeState 
        ? holidays.filter((h: any) => !h.state || h.state === employeeState || h.state === null)
        : holidays;
      
      // Buscar datas das faltas do funcionário para calcular DSR corretamente
      const employeeAbsenceDates = absencesByEmployee.get(employee.id) || [];
      
      // Usar valor manual de dsrPorFalta se existir, senão calcular
      const dsrPorFaltaCalculado = calcularDSRPorFaltas(salarioBase, faltas, employeeHolidays, diasDoMes, employeeAbsenceDates);
      const dsrPorFaltaFinal = (employee.dsrPorFalta !== null && employee.dsrPorFalta !== undefined) 
        ? Number(employee.dsrPorFalta) 
        : dsrPorFaltaCalculado;
      
      // VA%: Se não for MEI, então (25,2 × dias da referência do VA) × 0,09
      // VA/VT são correspondentes ao próximo mês
      // SEMPRE calcular no frontend para garantir que está correto (descontando feriados)
      // O backend pode retornar valores incorretos, então sempre recalcular
      const calculatedNextMonthWorkingDays = calculateNextMonthWorkingDays(currentMonth, currentYear, holidays);
      const nextMonthWorkingDays = calculatedNextMonthWorkingDays;
      // Usar as ausências já buscadas acima (employeeAbsenceDates) para descontar
      const totalAbsences = employeeAbsenceDates.length;
      // SEMPRE calcular no frontend descontando faltas e ausências do mês atual
      // Dias úteis do próximo mês - faltas do mês atual - ausências/folgas do mês atual
      const daysForVA = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
      const daysForVT = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
      // Calcular valores totais de VA e VT baseados nos dias calculados
      const totalVA = daysForVA * (employee.dailyFoodVoucher || 0);
      const totalVT = daysForVT * (employee.dailyTransportVoucher || 0);
      const percentualVA = employee.modality !== 'MEI' ? (25.2 * daysForVA) * 0.09 : 0;
      const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
      
      // Usar valor manual de horas extras se existir, senão usar o calculado
      const valorHorasExtrasCalculado = (employee.he50Value || 0) + (employee.he100Value || 0);
      const valorHorasExtras = (employee.horasExtrasValue !== null && employee.horasExtrasValue !== undefined) 
        ? Number(employee.horasExtrasValue) 
        : valorHorasExtrasCalculado;
      
      const diasUteis = employee.totalWorkingDays || 0;
      const diasNaoUteis = diasDoMes - diasUteis;
      
      // Usar valor manual de DSR HE se existir, senão calcular
      const valorDSRHECalculado = diasUteis > 0 ? 
        ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) + 
        ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)
        : 0;
      
      const valorDSRHE = (employee.dsrHEValue !== null && employee.dsrHEValue !== undefined) 
        ? (Number(employee.dsrHEValue) * (employee.hourlyRate || 0))
        : valorDSRHECalculado;
      const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
        ? 0 
        : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFaltaFinal);
      
      // Função para calcular INSS (mesma tabela do detalhamento)
      const calcularINSS = (baseINSS: number): number => {
        if (baseINSS <= 0) return 0;

        // Tabela progressiva (alinhada com a planilha do cliente)
        const faixa1 = 1621.0;
        const faixa2 = 2902.84;
        const faixa3 = 4354.27;
        const teto = 8475.55;

        const base = Math.min(baseINSS, teto);

        if (base <= faixa1) {
          return base * 0.075;
        }
        if (base <= faixa2) {
          return (faixa1 * 0.075) + ((base - faixa1) * 0.09);
        }
        if (base <= faixa3) {
          return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((base - faixa2) * 0.12);
        }
        return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((faixa3 - faixa2) * 0.12) + ((base - faixa3) * 0.14);
      };
      
      const inssMensal = calcularINSS(baseINSSMensal);
      const irrfMensal = employee.irrfMensal || 0;
      // Usar salarioFamilia ao invés de employee.familySalary para manter consistência com o detalhamento
      const salarioFamilia = employee.familySalary || 0;
      const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + totalVT;
      const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFaltaFinal + percentualVA + percentualVT + inssMensal + irrfMensal;
      const liquidoReceber = totalProventos - totalDescontos;
      const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);

      return {
        // Colunas na ordem especificada
        'NOME': employee.name || '',
        'EMPRESA': employee.company || '',
        'MODALIDADE': employee.modality || '',
        'CPF': employee.cpf || '',
        'ALOCAÇÃO FINAL': employee.alocacaoFinal || '',
        'BANCO': employee.bank || '',
        'TIPO DE CONTA': employee.accountType || '',
        'AGÊNCIA': employee.agency || '',
        'OPERAÇÃO': employee.operation || '',
        'CONTA': employee.account || '',
        'DÍGITO': employee.digit || '',
        'TIPO DE CHAVE PIX': employee.pixKeyType || '',
        'CHAVE PIX': employee.pixKey || '',
        'SALÁRIO BASE': formatCurrency(salarioBase),
        'LÍQUIDO': formatCurrency(liquidoReceber),
        'ACRÉSCIMOS TOTAIS': formatCurrency(employee.totalAdjustments || 0),
        'LÍQUIDO TOTAL': formatCurrency(liquidoComAcrescimos)
      };
    });

    // Calcular total do LÍQUIDO TOTAL (somar os valores numéricos antes de formatar)
    const totalLiquidoTotal = payrollData.employees.reduce((sum, employee) => {
      const salarioBase = employee.salary;
      const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
      const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
      const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
      const diasParaDesconto = 30;
      const descontoPorFaltasCalculado = diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
      const descontoPorFaltas = (employee.descontoPorFaltas !== null && employee.descontoPorFaltas !== undefined) 
        ? Number(employee.descontoPorFaltas) 
        : descontoPorFaltasCalculado;
      
      const employeeState = poloToState(employee.polo);
      const employeeHolidays = employeeState 
        ? holidays.filter((h: any) => !h.state || h.state === employeeState || h.state === null)
        : holidays;
      
      const employeeAbsenceDates = absencesByEmployee.get(employee.id) || [];
      const dsrPorFaltaCalculado = calcularDSRPorFaltas(salarioBase, faltas, employeeHolidays, diasDoMes, employeeAbsenceDates);
      const dsrPorFaltaFinal = (employee.dsrPorFalta !== null && employee.dsrPorFalta !== undefined) 
        ? Number(employee.dsrPorFalta) 
        : dsrPorFaltaCalculado;
      
      const calculatedNextMonthWorkingDays = calculateNextMonthWorkingDays(currentMonth, currentYear, holidays);
      const nextMonthWorkingDays = calculatedNextMonthWorkingDays;
      const totalAbsences = employeeAbsenceDates.length;
      const daysForVA = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
      const daysForVT = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
      const totalVA = daysForVA * (employee.dailyFoodVoucher || 0);
      const totalVT = daysForVT * (employee.dailyTransportVoucher || 0);
      const percentualVA = employee.modality !== 'MEI' ? (25.2 * daysForVA) * 0.09 : 0;
      const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
      
      const valorHorasExtrasCalculado = (employee.he50Value || 0) + (employee.he100Value || 0);
      const valorHorasExtras = (employee.horasExtrasValue !== null && employee.horasExtrasValue !== undefined) 
        ? Number(employee.horasExtrasValue) 
        : valorHorasExtrasCalculado;
      
      const diasUteis = employee.totalWorkingDays || 0;
      const diasNaoUteis = diasDoMes - diasUteis;
      const valorDSRHECalculado = diasUteis > 0 ? 
        ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) + 
        ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)
        : 0;
      const valorDSRHE = (employee.dsrHEValue !== null && employee.dsrHEValue !== undefined) 
        ? (Number(employee.dsrHEValue) * (employee.hourlyRate || 0))
        : valorDSRHECalculado;
      const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
        ? 0 
        : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFaltaFinal);
      
      const calcularINSS = (baseINSS: number): number => {
        if (baseINSS <= 0) return 0;
        const faixa1 = 1621.0;
        const faixa2 = 2902.84;
        const faixa3 = 4354.27;
        const teto = 8475.55;
        const base = Math.min(baseINSS, teto);
        if (base <= faixa1) {
          return base * 0.075;
        }
        if (base <= faixa2) {
          return (faixa1 * 0.075) + ((base - faixa1) * 0.09);
        }
        if (base <= faixa3) {
          return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((base - faixa2) * 0.12);
        }
        return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((faixa3 - faixa2) * 0.12) + ((base - faixa3) * 0.14);
      };
      
      const inssMensal = calcularINSS(baseINSSMensal);
      const irrfMensal = employee.irrfMensal || 0;
      const salarioFamilia = employee.familySalary || 0;
      const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + totalVT;
      const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFaltaFinal + percentualVA + percentualVT + inssMensal + irrfMensal;
      const liquidoReceber = totalProventos - totalDescontos;
      const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);
      
      return sum + liquidoComAcrescimos;
    }, 0);

    // Adicionar 2 linhas vazias
    const emptyRow1: any = {
      'NOME': '',
      'EMPRESA': '',
      'MODALIDADE': '',
      'CPF': '',
      'ALOCAÇÃO FINAL': '',
      'BANCO': '',
      'TIPO DE CONTA': '',
      'AGÊNCIA': '',
      'OPERAÇÃO': '',
      'CONTA': '',
      'DÍGITO': '',
      'TIPO DE CHAVE PIX': '',
      'CHAVE PIX': '',
      'SALÁRIO BASE': '',
      'LÍQUIDO': '',
      'ACRÉSCIMOS TOTAIS': '',
      'LÍQUIDO TOTAL': ''
    };
    const emptyRow2: any = { ...emptyRow1 };
    
    exportData.push(emptyRow1);
    exportData.push(emptyRow2);

    // Adicionar linha de TOTAL com "TOTAL" na coluna ACRÉSCIMOS TOTAIS (ao lado esquerdo de LÍQUIDO TOTAL)
    const totalRow: any = {
      'NOME': '',
      'EMPRESA': '',
      'MODALIDADE': '',
      'CPF': '',
      'ALOCAÇÃO FINAL': '',
      'BANCO': '',
      'TIPO DE CONTA': '',
      'AGÊNCIA': '',
      'OPERAÇÃO': '',
      'CONTA': '',
      'DÍGITO': '',
      'TIPO DE CHAVE PIX': '',
      'CHAVE PIX': '',
      'SALÁRIO BASE': '',
      'LÍQUIDO': '',
      'ACRÉSCIMOS TOTAIS': 'TOTAL',
      'LÍQUIDO TOTAL': formatCurrency(totalLiquidoTotal)
    };
    exportData.push(totalRow);

    // Criar planilha
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Ajustar largura das colunas
    const colWidths = [
      { wch: 30 }, // NOME
      { wch: 15 }, // EMPRESA
      { wch: 15 }, // MODALIDADE
      { wch: 15 }, // CPF
      { wch: 30 }, // ALOCAÇÃO FINAL
      { wch: 15 }, // BANCO
      { wch: 15 }, // TIPO DE CONTA
      { wch: 10 }, // AGÊNCIA
      { wch: 10 }, // OPERAÇÃO
      { wch: 12 }, // CONTA
      { wch: 8 },  // DÍGITO
      { wch: 15 }, // TIPO DE CHAVE PIX
      { wch: 20 }, // CHAVE PIX
      { wch: 15 }, // SALÁRIO BASE
      { wch: 15 }, // LÍQUIDO
      { wch: 18 }, // ACRÉSCIMOS TOTAIS
      { wch: 18 }  // LÍQUIDO TOTAL
    ];
    ws['!cols'] = colWidths;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Folha de Pagamento');

    // Gerar nome do arquivo
    const monthName = payrollData.period.monthName;
    const year = payrollData.period.year;
    const fileName = `Folha_Pagamento_${monthName}_${year}.xlsx`;

    // Baixar arquivo
    XLSX.writeFile(wb, fileName);
  };

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/folha-pagamento">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  

  const payrollData: MonthlyPayrollData | null = payrollResponse?.data || null;
  const employees: PayrollEmployee[] = payrollData?.employees || [];
  
  // Log para debug
  console.log('📊 payrollResponse:', payrollResponse);
  console.log('📊 payrollData:', payrollData);
  console.log('📊 employees:', employees);
  console.log('📊 employees length:', employees?.length);
  console.log('❌ Erro folha de pagamento:', payrollError);
  
  const uniqueDepartments = Array.from(
    new Set((employees || []).map(emp => emp.department).filter(Boolean))
  ).sort();

  // Opções de mês e ano
  const yearFilterOptions = useMemo(
    () =>
      labeledToSelectOptions(
        Array.from({ length: 11 }, (_, i) => {
          const year = currentYear - 5 + i;
          return { value: String(year), label: String(year) };
        })
      ),
    [currentYear]
  );

  const costCenterFilterOptions = useMemo(
    () => filterWithEmpty('Todos os centros', costCentersList),
    [costCentersList]
  );

  return (
    <ProtectedRoute route="/ponto/folha-pagamento">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Folha de Pagamento</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Gerencie e visualize informações salariais dos funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="border-b-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              </div>
              <div className="flex items-center space-x-4">
                {!isFiltersMinimized && (
                  <>
                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
                    </button>
                    <button
                      onClick={clearFilters}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar todos os filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                  className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
                >
                  {isFiltersMinimized ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </CardHeader>
          {!isFiltersMinimized && (
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
              {/* Filtro Principal - Busca Geral */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Buscar Funcionário
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={handleSearchChange}
                    placeholder="Digite nome, CPF, matrícula, setor, empresa ou qualquer informação..."
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Filtros de Período - Sempre Visíveis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mês
                  </label>
                  <StringSingleSelectDropdown
                    value={String(filters.month)}
                    onChange={(v) => setFilters((prev) => ({ ...prev, month: parseInt(v, 10) }))}
                    options={MONTH_FILTER_OPTIONS}
                    allowEmpty={false}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ano
                  </label>
                  <StringSingleSelectDropdown
                    value={String(filters.year)}
                    onChange={(v) => setFilters((prev) => ({ ...prev, year: parseInt(v, 10) }))}
                    options={yearFilterOptions}
                    allowEmpty={false}
                  />
                </div>
              </div>

              {/* Filtros Avançados - Condicionais */}
              {showAdvancedFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros Específicos</h4>
                  </div>
                  
                  {/* Grupo 1: Informações Básicas */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Básicas</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.department}
                          onChange={(v) => setFilters((prev) => ({ ...prev, department: v }))}
                          options={DEPARTMENT_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.position}
                          onChange={(v) => setFilters((prev) => ({ ...prev, position: v }))}
                          options={POSITION_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Empresa
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.company}
                          onChange={(v) => setFilters((prev) => ({ ...prev, company: v }))}
                          options={COMPANY_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grupo 2: Informações Financeiras */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Financeiras</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Centro de Custo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.costCenter}
                          onChange={(v) => setFilters((prev) => ({ ...prev, costCenter: v }))}
                          options={costCenterFilterOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tomador
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.client}
                          onChange={(v) => setFilters((prev) => ({ ...prev, client: v }))}
                          options={CLIENT_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Polo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.polo}
                          onChange={(v) => setFilters((prev) => ({ ...prev, polo: v }))}
                          options={POLO_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Modalidade
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.modality}
                          onChange={(v) => setFilters((prev) => ({ ...prev, modality: v }))}
                          options={MODALITY_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grupo 3: Informações Bancárias */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Bancárias</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Banco
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.bank}
                          onChange={(v) => setFilters((prev) => ({ ...prev, bank: v }))}
                          options={BANK_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tipo de Conta
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.accountType}
                          onChange={(v) => setFilters((prev) => ({ ...prev, accountType: v }))}
                          options={ACCOUNT_TYPE_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Lista de Funcionários */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Folha de Pagamento</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Dados de remuneração dos funcionários</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {/* Indicador de Status */}
                {isFinalized && (
                  <div className="flex items-center space-x-2 px-3 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                      Folha Finalizada
                    </span>
                  </div>
                )}
                {!isFinalized && (
                  <div className="flex items-center space-x-2 px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                    <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                      Em Elaboração
                    </span>
                  </div>
                )}
                
                {/* Botão de Finalização - Para DP e Administrador */}
                {canFinalizePayroll && !isFinalized && (
                  <button
                    onClick={handleFinalizePayroll}
                    disabled={!payrollData || payrollData.employees.length === 0}
                    className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                    title="Finalizar folha de pagamento"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Finalizar Folha</span>
                  </button>
                )}
                
                {/* Botão de Reabertura - Para Financeiro e Administrador */}
                {canReopenPayroll && isFinalized && (
                  <button
                    onClick={handleReopenPayroll}
                    className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm sm:text-base"
                    title="Reabrir folha de pagamento para correções"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reabrir Folha</span>
                  </button>
                )}
                
                <button
                  onClick={exportToExcel}
                  disabled={!payrollData || payrollData.employees.length === 0}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                  title="Exportar para Excel"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-scroll">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                      Setor
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                      Empresa
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Centro de <br/>Custo 
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Tomador
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Líquido Total
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {payrollError ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="text-red-600 dark:text-red-400">
                          <p className="font-semibold">Erro ao carregar dados</p>
                          <p className="text-sm mt-1">
                            {payrollError instanceof Error && payrollError.message.includes('CORS')
                              ? 'Erro de CORS: Verifique a configuração do servidor'
                              : payrollError instanceof Error
                              ? payrollError.message
                              : 'Não foi possível conectar ao servidor. Tente novamente mais tarde.'}
                          </p>
                          <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                            Verifique o console do navegador para mais detalhes.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : loadingPayroll ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <CadastroListLoading message="Carregando folha de pagamento..." />
                      </td>
                    </tr>
                  ) : !Array.isArray(employees) || employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr
                        key={employee.id}
                        onClick={() => handleViewDetails(employee)}
                        className={getListTableRowClassName(true)}
                      >
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div>
                            <ListRowNavigableLabel className="font-medium">
                              {employee.name}
                            </ListRowNavigableLabel>
                            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              {employee.cpf || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 sm:hidden">
                              {employee.department && `${employee.department} • ${employee.company || 'N/A'}`}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden sm:table-cell">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {employee.position || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden md:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.company || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.costCenter || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.client || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            R$ {(() => {
                              const salarioBase = employee.salary;
                              const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
                              const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
                              const salarioFamilia = employee.familySalary || 0;
                              const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
                              
                              // Calcular número de dias do mês para desconto de faltas
                              // Usa 30 como padrão, ou 31 apenas se for o mês de admissão E o mês de admissão tiver 31 dias
                              let diasParaDesconto = 30; // Padrão
                              if (employee.admissionDate) {
                                const admissionDate = new Date(employee.admissionDate);
                                const mesAdmissao = admissionDate.getMonth() + 1; // getMonth() retorna 0-11
                                const anoAdmissao = admissionDate.getFullYear();
                                
                                // Só usa 31 dias se for o mês de admissão e o mês tiver 31 dias
                                if (filters.month === mesAdmissao && filters.year === anoAdmissao) {
                                  const diasMesAdmissao = new Date(anoAdmissao, mesAdmissao, 0).getDate();
                                  if (diasMesAdmissao === 31) {
                                    diasParaDesconto = 31;
                                  }
                                }
                              }
                              
                              // Calcular número de dias do mês atual (para outros cálculos)
                              const diasDoMes = new Date(filters.year, filters.month, 0).getDate();
                              
                              // Usar valor manual de descontoPorFaltas se existir, senão calcular
                              // Usar a mesma fórmula do backend: (salarioBase + periculosidade + insalubridade) / diasParaDesconto * faltas
                              const descontoPorFaltasCalculado = diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
                              const descontoPorFaltas = (employee.descontoPorFaltas !== null && employee.descontoPorFaltas !== undefined) 
                                ? Number(employee.descontoPorFaltas) 
                                : descontoPorFaltasCalculado;
                              
                              // Buscar feriados do estado do funcionário para calcular DSR
                              const employeeState = poloToState(employee.polo);
                              const employeeHolidays = employeeState 
                                ? holidays.filter((h: any) => !h.state || h.state === employeeState || h.state === null)
                                : holidays;
                              
                              // Buscar datas das faltas do funcionário para calcular DSR corretamente
                              const employeeAbsenceDates = absencesByEmployee.get(employee.id) || [];
                              
                              // Usar valor manual de dsrPorFalta se existir, senão calcular
                              const dsrPorFaltaCalculado = calcularDSRPorFaltas(salarioBase, faltas, employeeHolidays, diasDoMes, employeeAbsenceDates);
                              const dsrPorFaltaFinal = (employee.dsrPorFalta !== null && employee.dsrPorFalta !== undefined) 
                                ? Number(employee.dsrPorFalta) 
                                : dsrPorFaltaCalculado;
                              
                              // Cálculos de %VA e %VT baseados no polo
                              // VA%: Se não for MEI, então (25,2 × dias da referência do VA) × 0,09
                              // VA/VT são correspondentes ao próximo mês
                              // SEMPRE calcular no frontend para garantir que está correto (descontando feriados)
                              // O backend pode retornar valores incorretos, então sempre recalcular
                              const calculatedNextMonthWorkingDays = calculateNextMonthWorkingDays(filters.month, filters.year, holidays);
                              const nextMonthWorkingDays = calculatedNextMonthWorkingDays;
                              // Usar as ausências já buscadas acima (employeeAbsenceDates) para descontar
                              const totalAbsences = employeeAbsenceDates.length;
                              // SEMPRE calcular no frontend descontando faltas e ausências do mês atual
                              // Dias úteis do próximo mês - faltas do mês atual - ausências/folgas do mês atual
                              const daysForVA = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
                              const daysForVT = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
                              // Calcular valores totais de VA e VT baseados nos dias calculados
                              const totalVA = daysForVA * (employee.dailyFoodVoucher || 0);
                              const totalVT = daysForVT * (employee.dailyTransportVoucher || 0);
                              const percentualVA = employee.modality !== 'MEI' ? (25.2 * daysForVA) * 0.09 : 0;
                              const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
                              
                              const totalHorasExtras = (employee.he50Hours || 0) + (employee.he100Hours || 0);
                              const diasUteis = employee.totalWorkingDays || 0;
                              const diasNaoUteis = diasDoMes - diasUteis;
                              
                              // Usar valor manual de DSR HE se existir, senão calcular
                              const valorDSRHECalculado = diasUteis > 0 ? 
                                ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) + 
                                ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)
                                : 0;
                              
                              const valorDSRHE = (employee.dsrHEValue !== null && employee.dsrHEValue !== undefined) 
                                ? (Number(employee.dsrHEValue) * (employee.hourlyRate || 0))
                                : valorDSRHECalculado;
                              
                              // Usar valor manual de horas extras se existir, senão usar o calculado
                              const valorHorasExtrasCalculado = (employee.he50Value || 0) + (employee.he100Value || 0);
                              const valorHorasExtras = (employee.horasExtrasValue !== null && employee.horasExtrasValue !== undefined) 
                                ? Number(employee.horasExtrasValue) 
                                : valorHorasExtrasCalculado;
                              const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
                                ? 0 
                                : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFaltaFinal);
                              
                              const calcularINSS = (baseINSS: number): number => {
                                if (baseINSS <= 0) return 0;

                                // Tabela progressiva (alinhada com a planilha do cliente)
                                const faixa1 = 1621.0;
                                const faixa2 = 2902.84;
                                const faixa3 = 4354.27;
                                const teto = 8475.55;

                                const base = Math.min(baseINSS, teto);

                                if (base <= faixa1) {
                                  return base * 0.075;
                                }
                                if (base <= faixa2) {
                                  return (faixa1 * 0.075) + ((base - faixa1) * 0.09);
                                }
                                if (base <= faixa3) {
                                  return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((base - faixa2) * 0.12);
                                }
                                return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((faixa3 - faixa2) * 0.12) + ((base - faixa3) * 0.14);
                              };

                              const inssMensal = calcularINSS(baseINSSMensal);
                              const irrfMensal = employee.irrfMensal || 0;
                              
                              const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + totalVT;
                              const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFaltaFinal + percentualVA + percentualVT + inssMensal + irrfMensal;
                              const liquidoReceber = totalProventos - totalDescontos;
                              const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);
                              
                              return liquidoComAcrescimos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleViewDetails(employee)}
                              className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                              title="Ver detalhes"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Estatísticas */}
            {employees.length > 0 && payrollData && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-6">
                    <span>
                      <strong>Período:</strong> {payrollData.period.monthName} de {payrollData.period.year}
                    </span>
                  <span>
                      <strong>Total de funcionários:</strong> {payrollData.totals.totalEmployees}
                  </span>
                  </div>
                  {filters.department && (
                    <span>
                      <strong>Setor:</strong> {filters.department}
                    </span>
                  )}
                  {filters.company && (
                    <span>
                      <strong>Empresa:</strong> {filters.company}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      {selectedEmployee && (
        <PayrollDetailModal
          employee={selectedEmployee}
          month={filters.month}
          year={filters.year}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          isPayrollFinalized={isFinalized}
        />
      )}
      </MainLayout>
    </ProtectedRoute>
  );
}
