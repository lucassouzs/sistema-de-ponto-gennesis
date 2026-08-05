import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Calendar, User, Building, DollarSign, Clock, AlertTriangle, CreditCard, Moon, Save } from 'lucide-react';
import { PayrollEmployee } from '@/types';
import api from '@/lib/api';
import { useCostCenters } from '@/hooks/useCostCenters';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';

interface PayrollDetailModalProps {
  employee: PayrollEmployee;
  month: number;
  year: number;
  isOpen: boolean;
  onClose: () => void;
  onEmployeeUpdate?: (updatedEmployee: PayrollEmployee) => void;
  isPayrollFinalized?: boolean;
}

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

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

export function PayrollDetailModal({ employee, month, year, isOpen, onClose, onEmployeeUpdate, isPayrollFinalized = false }: PayrollDetailModalProps) {
  const monthName = monthNames[month - 1];
  const { costCentersList, costCenters, isLoading: loadingCostCenters } = useCostCenters();
  
  // Função para encontrar o nome do centro de custo baseado no código ou valor salvo
  const getCostCenterLabel = (value: string | null): string | null => {
    if (!value) return null;
    // Se está no formato "CÓDIGO - NOME", extrair apenas o nome
    if (value.includes(' - ')) {
      const parts = value.split(' - ');
      return parts.length > 1 ? parts[1] : value;
    }
    // Se é apenas o código, buscar o nome correspondente (se os dados já carregaram)
    if (costCenters.length > 0) {
      const found = costCenters.find(cc => cc.code === value);
      if (found) return found.name ?? value;
    }
    // Se não encontrou ou ainda não carregou, retornar o valor original
    return value;
  };
  
  // Estados para os valores manuais editáveis
  const [inssRescisao, setInssRescisao] = useState(employee.inssRescisao || 0);
  const [inss13, setInss13] = useState(employee.inss13 || 0);
  const [descontoPorFaltas, setDescontoPorFaltas] = useState<number | null>(null);
  const [dsrPorFalta, setDsrPorFalta] = useState<number | null>(null);
  const [horasExtrasValue, setHorasExtrasValue] = useState<number | null>(null);
  const [dsrHEValue, setDsrHEValue] = useState<number | null>(null);
  const [alocacaoFinal, setAlocacaoFinal] = useState<string | null>(employee.alocacaoFinal || null);
  const [editingField, setEditingField] = useState<'inssRescisao' | 'inss13' | 'descontoPorFaltas' | 'dsrPorFalta' | 'horasExtras' | 'dsrHE' | 'alocacaoFinal' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Armazenar valores originais para cancelar edição
  const [originalValues, setOriginalValues] = useState({
    inssRescisao: employee.inssRescisao || 0,
    inss13: employee.inss13 || 0,
    descontoPorFaltas: employee.descontoPorFaltas !== undefined ? employee.descontoPorFaltas : null,
    dsrPorFalta: employee.dsrPorFalta !== undefined ? employee.dsrPorFalta : null,
    horasExtrasValue: null,
    dsrHEValue: null,
    alocacaoFinal: employee.alocacaoFinal || null
  });

  // Atualizar estados quando o funcionário mudar ou quando os centros de custo carregarem
  useEffect(() => {
    if (loadingCostCenters) return; // Aguardar carregar os centros de custo
    
    const newValues = {
      inssRescisao: employee.inssRescisao || 0,
      inss13: employee.inss13 || 0,
      descontoPorFaltas: employee.descontoPorFaltas !== undefined ? employee.descontoPorFaltas : null,
      dsrPorFalta: employee.dsrPorFalta !== undefined ? employee.dsrPorFalta : null,
      horasExtrasValue: null,
      dsrHEValue: null,
      alocacaoFinal: getCostCenterLabel(employee.alocacaoFinal)
    };
    setOriginalValues(newValues);
    setInssRescisao(newValues.inssRescisao);
    setInss13(newValues.inss13);
    setDescontoPorFaltas(newValues.descontoPorFaltas);
    setDsrPorFalta(newValues.dsrPorFalta);
    setHorasExtrasValue(newValues.horasExtrasValue);
    setDsrHEValue(newValues.dsrHEValue);
    setAlocacaoFinal(newValues.alocacaoFinal);
  }, [employee, loadingCostCenters, costCenters]);

  // Função para cancelar edição
  const handleCancelEdit = () => {
    setInssRescisao(originalValues.inssRescisao);
    setInss13(originalValues.inss13);
    setDescontoPorFaltas(originalValues.descontoPorFaltas);
    setDsrPorFalta(originalValues.dsrPorFalta);
    setHorasExtrasValue(originalValues.horasExtrasValue);
    setDsrHEValue(originalValues.dsrHEValue);
    setAlocacaoFinal(originalValues.alocacaoFinal);
    setEditingField(null);
  };

  // Converter polo para estado (para buscar feriados)
  const poloToState = (polo?: string | null): string | undefined => {
    if (!polo) return undefined;
    const poloUpper = polo.toUpperCase();
    if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
    if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
    return undefined;
  };

  // Buscar feriados do ano (incluindo próximo mês para cálculo de VA/VT)
  const employeeState = poloToState(employee.polo);
  const { data: holidaysData } = useQuery({
    queryKey: ['holidays', year, employeeState],
    queryFn: async () => {
      const params: any = { year };
      // Não especificar mês para buscar todos os feriados do ano (incluindo próximo mês)
      const res = await api.get('/holidays', { params });
      return res.data;
    },
    enabled: isOpen
  });

  const holidays = holidaysData?.data || [];

  // Buscar datas das faltas do funcionário
  const { data: absencesData } = useQuery({
    queryKey: ['absences', employee.id, year, month],
    queryFn: async () => {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      
      const res = await fetch(`${API_URL}/time-records?employeeId=${employee.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&type=ABSENCE_JUSTIFIED`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!res.ok) return { data: [] };
      const data = await res.json();
      return data;
    },
    enabled: isOpen && !!employee.id
  });

  const absenceDates = absencesData?.data?.map((record: any) => new Date(record.timestamp)) || [];
  const totalAbsences = absenceDates.length;
  
  // Função para salvar os valores manuais
  const handleSaveManualValues = async () => {
    if (isPayrollFinalized) {
      alert('Não é possível alterar valores de uma folha finalizada. Solicite ao setor financeiro que reabra a folha para correções.');
      return;
    }

    setIsSaving(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/payroll/manual-inss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeId: employee.id,
          month,
          year,
          inssRescisao,
          inss13,
          descontoPorFaltas: descontoPorFaltas !== null ? descontoPorFaltas : undefined,
          dsrPorFalta: dsrPorFalta !== null ? dsrPorFalta : undefined,
          horasExtrasValue: horasExtrasValue !== null ? horasExtrasValue : undefined,
          dsrHEValue: dsrHEValue !== null ? dsrHEValue : undefined,
          // Extrair apenas o código se estiver no formato "CÓDIGO - NOME"
          // Salvar o nome do centro de custo (já está apenas o nome agora)
          alocacaoFinal: alocacaoFinal !== null && alocacaoFinal !== '' ? alocacaoFinal : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erro ao salvar valores manuais');
      }

      // Recarregar dados do funcionário
      const employeeResponse = await fetch(`${API_URL}/payroll/employee/${employee.id}?month=${month}&year=${year}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (employeeResponse.ok) {
        const updatedEmployeeData = await employeeResponse.json();
        if (updatedEmployeeData.success && updatedEmployeeData.data) {
          // Atualizar os estados locais
          const newValues = {
            inssRescisao: updatedEmployeeData.data.inssRescisao || 0,
            inss13: updatedEmployeeData.data.inss13 || 0,
            descontoPorFaltas: updatedEmployeeData.data.descontoPorFaltas !== undefined ? updatedEmployeeData.data.descontoPorFaltas : null,
            dsrPorFalta: updatedEmployeeData.data.dsrPorFalta !== undefined ? updatedEmployeeData.data.dsrPorFalta : null,
            horasExtrasValue: updatedEmployeeData.data.horasExtrasValue !== undefined ? updatedEmployeeData.data.horasExtrasValue : null,
            dsrHEValue: updatedEmployeeData.data.dsrHEValue !== undefined ? updatedEmployeeData.data.dsrHEValue : null,
            alocacaoFinal: getCostCenterLabel(updatedEmployeeData.data.alocacaoFinal || null)
          };
          
          setInssRescisao(newValues.inssRescisao);
          setInss13(newValues.inss13);
          setDescontoPorFaltas(newValues.descontoPorFaltas);
          setDsrPorFalta(newValues.dsrPorFalta);
          setHorasExtrasValue(newValues.horasExtrasValue);
          setDsrHEValue(newValues.dsrHEValue);
          setAlocacaoFinal(newValues.alocacaoFinal);
          
          // Atualizar valores originais para o próximo cancelamento
          setOriginalValues(newValues);
          
          // Notificar o componente pai sobre a atualização
          if (onEmployeeUpdate) {
            onEmployeeUpdate(updatedEmployeeData.data);
          }
        }
      }

      setEditingField(null);
      console.log('Valores salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Cálculos
  const salarioBase = employee.salary;
  const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
  const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
  const salarioFamilia = employee.familySalary || 0;
  // Usar absences do backend (sempre 0 para ausências justificadas) ao invés de calcular pela diferença
  // O backend já retorna absences: 0 quando há apenas ausências justificadas (folgas)
  const faltas = employee.absences !== undefined ? employee.absences : 0;
  
  // Calcular número de dias do mês para desconto de faltas
  // Usa 30 como padrão, ou 31 apenas se for o mês de admissão E o mês de admissão tiver 31 dias
  let diasParaDesconto = 30; // Padrão
  if (employee.admissionDate) {
    const admissionDate = new Date(employee.admissionDate);
    const mesAdmissao = admissionDate.getMonth() + 1; // getMonth() retorna 0-11
    const anoAdmissao = admissionDate.getFullYear();
    
    // Só usa 31 dias se for o mês de admissão e o mês tiver 31 dias
    if (month === mesAdmissao && year === anoAdmissao) {
      const diasMesAdmissao = new Date(anoAdmissao, mesAdmissao, 0).getDate();
      if (diasMesAdmissao === 31) {
        diasParaDesconto = 31;
      }
    }
  }
  
  // Calcular número de dias do mês atual (para outros cálculos)
  const diasDoMes = new Date(year, month, 0).getDate(); // Último dia do mês
  
  // Calcular desconto por faltas (usar valor manual se existir)
  // Usar a mesma fórmula do backend: (salarioBase + periculosidade + insalubridade) / diasParaDesconto * faltas
  const descontoPorFaltasCalculado = diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
  const descontoPorFaltasFinal = (descontoPorFaltas !== null && descontoPorFaltas !== undefined) ? Number(descontoPorFaltas) : descontoPorFaltasCalculado;
  
  // Debug: verificar valores
  if (faltas > 0) {
    console.log('🔍 Debug DSR por Falta:', {
      salarioBase,
      faltas,
      descontoPorFaltas: (descontoPorFaltasFinal || 0).toFixed(2),
      calculo: `(${salarioBase} / 30) * ${faltas} = ${(descontoPorFaltasFinal || 0).toFixed(2)}`
    });
  }
  
  // Desconto de Periculosidade + Insalubridade por faltas
  const descontoPericInsalub = ((periculosidade + insalubridade) / 30) * faltas;
  
  // Cálculo do DSR por Falta considerando feriados
  // Nova lógica:
  // - Se faltar em uma semana que tem feriado, perde: 1 DSR pela falta + 1 DSR por cada feriado daquela semana
  // - Exemplo: 1 falta em semana com 2 feriados = 1 DSR (falta) + 2 DSR (feriados) = 3 DSR
  // - Exemplo: 2 faltas em semanas diferentes, uma com 1 feriado = 1 DSR (falta semana 1) + 1 DSR (feriado semana 1) + 1 DSR (falta semana 2) = 3 DSR
  let dsrPorFaltaCalculado = 0;
  let referenciaDSR = '';
  
  if (faltas > 0) {
    // Verificar quantos feriados úteis há no mês (segunda a sábado)
    const feriadosUteis = holidays.filter((holiday: any) => {
      const holidayDate = new Date(holiday.date);
      const dayOfWeek = holidayDate.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 6; // Segunda a sábado
    });

    // Função para obter o início da semana (domingo) de uma data
    const getWeekStart = (date: Date): Date => {
      const dateCopy = new Date(date);
      const dayOfWeek = dateCopy.getDay();
      const weekStart = new Date(dateCopy);
      weekStart.setDate(dateCopy.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    };

    // Se temos as datas das faltas, calcular DSR por semana com falta
    if (absenceDates.length > 0 && absenceDates.length === faltas) {
      // Agrupar faltas por semana
      const semanasComFaltas = new Map<string, number>(); // semana -> quantidade de faltas
      absenceDates.forEach((absenceDate: Date) => {
        const weekStart = getWeekStart(absenceDate);
        const weekKey = weekStart.toISOString();
        semanasComFaltas.set(weekKey, (semanasComFaltas.get(weekKey) || 0) + 1);
      });

      let totalDSR = 0;
      const detalhesSemanas: string[] = [];

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

        // Montar detalhe para exibição
        if (feriadosNaSemana > 0) {
          detalhesSemanas.push(`${numFaltasNaSemana} falta(s) na semana + ${feriadosNaSemana} feriado(s) (${dsrDaSemana} DSR)`);
        } else {
          detalhesSemanas.push(`${numFaltasNaSemana} falta(s) na semana (1 DSR)`);
        }
      });

      dsrPorFaltaCalculado = (salarioBase / 30) * totalDSR;
      referenciaDSR = detalhesSemanas.join(' | ');
    } else {
      // Fallback: se não temos as datas exatas, assumir que estão em semanas diferentes
      // Contar todos os feriados do mês
      const quantidadeFeriados = feriadosUteis.length;
      // 1 DSR por falta + 1 DSR por cada feriado (assumindo que pode estar na mesma semana)
      const totalDSR = faltas + quantidadeFeriados;
      dsrPorFaltaCalculado = (salarioBase / 30) * totalDSR;

      if (quantidadeFeriados === 0) {
        referenciaDSR = `${faltas} falta(s) - Sem feriado no mês (1 DSR por falta)`;
      } else {
        referenciaDSR = `${faltas} falta(s) + ${quantidadeFeriados} feriado(s) no mês`;
      }
    }
  } else {
    referenciaDSR = '-';
  }
  
  // Usar valor manual de DSR se existir, senão usar o calculado
  const dsrPorFaltaFinal = (dsrPorFalta !== null && dsrPorFalta !== undefined) ? Number(dsrPorFalta) : dsrPorFaltaCalculado;
  
  // Cálculos de %VA e %VT baseados no polo
  // VA%: Se não for MEI, então (25,2 × dias da referência do VA) × 0,09
  // VA/VT são correspondentes ao próximo mês
  // SEMPRE calcular no frontend para garantir que está correto (descontando feriados)
  // O backend pode retornar valores incorretos, então sempre recalcular
  const calculatedNextMonthWorkingDays = calculateNextMonthWorkingDays(month, year, holidays);
  // Usar o valor calculado no frontend, que é mais confiável
  const nextMonthWorkingDays = calculatedNextMonthWorkingDays;
  // SEMPRE calcular no frontend descontando faltas e ausências do mês atual
  // Dias úteis do próximo mês - faltas do mês atual - ausências/folgas do mês atual
  const daysForVA = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
  const daysForVT = Math.max(0, nextMonthWorkingDays - totalAbsences - faltas);
  // Calcular valores totais de VA e VT baseados nos dias calculados
  const totalVA = daysForVA * (employee.dailyFoodVoucher || 0);
  const totalVT = daysForVT * (employee.dailyTransportVoucher || 0);
  const percentualVA = employee.modality !== 'MEI' ? (25.2 * daysForVA) * 0.09 : 0;
  const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
  
  // Cálculo do DSR H.E (Descanso Semanal Remunerado sobre Horas Extras)
  const totalHorasExtras = (employee.he50Hours || 0) + (employee.he100Hours || 0);
  const diasUteis = employee.totalWorkingDays || 0; // Segunda a Sábado
  const diasNaoUteis = diasDoMes - diasUteis; // Domingo + feriados
  const dsrHECalculado = diasUteis > 0 ? (totalHorasExtras / diasUteis) * diasNaoUteis : 0;
  
  // Usar valor manual de DSR HE se existir, senão usar o calculado
  const dsrHE = (dsrHEValue !== null && dsrHEValue !== undefined) ? Number(dsrHEValue) : dsrHECalculado;
  
  // Cálculo do valor do DSR H.E considerando as diferentes taxas
  // he50Hours e he100Hours já vêm multiplicados do backend
  const valorDSRHECalculado = diasUteis > 0 ? 
    ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) +  // DSR sobre HE 50% (já multiplicado)
    ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)   // DSR sobre HE 100% (já multiplicado)
    : 0;
  
  // Usar valor manual se existir, senão usar o calculado
  const valorDSRHE = (dsrHEValue !== null && dsrHEValue !== undefined) 
    ? (dsrHEValue * (employee.hourlyRate || 0))
    : valorDSRHECalculado;
  
  // Cálculo da BASE INSS MENSAL
  // Usar valor manual de horas extras se existir, senão usar o calculado
  const valorHorasExtras = (horasExtrasValue !== null && horasExtrasValue !== undefined) 
    ? Number(horasExtrasValue) 
    : ((employee.he50Value || 0) + (employee.he100Value || 0));
  const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
    ? 0 
    : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltasFinal - dsrPorFaltaFinal);
  
  // Cálculo do INSS MENSAL (Tabela Progressiva)
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
  
  // Calcular Base IRRF para tooltip
  const salarioBruto = salarioBase + periculosidade + insalubridade + salarioFamilia;
  const baseIRRF = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
    ? 0 
    : Math.max(0, salarioBruto - 607.20);
  
  // Cálculo do DCTFWEB: (INSS Total + IRRF Total) - Salário Família
  const dctfweb = ((employee.inssTotal || 0) + (employee.irrfTotal || 0)) - salarioFamilia;
  
  const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + totalVT;
  const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltasFinal + dsrPorFaltaFinal + percentualVA + percentualVT + inssMensal + irrfMensal;
  const liquidoReceber = totalProventos - totalDescontos;
  
  // Cálculo com acréscimos
  const totalProventosComAcrescimos = totalProventos + (employee.totalAdjustments || 0);
  const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);

  if (!isOpen) return null;

  return (
    <div className="app-modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2">
                <img 
                  src="/logopv.png" 
                  alt="Logo da Empresa" 
                  className="w-12 h-12 object-contain dark:hidden"
                />
                <img 
                  src="/logobranca.png" 
                  alt="Logo da Empresa" 
                  className="w-12 h-12 object-contain hidden dark:block"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Folha de Pagamento</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{monthName} de {year}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Employee Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">
                Dados do Funcionário
              </h4>
              <div className="rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Nome:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">CPF:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.cpf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Matrícula:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.employeeId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Função:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.position}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Setor:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.department}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">
                Dados da Empresa
              </h4>
              <div className="rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Empresa:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.company || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Polo:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.polo || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Categoria Financeira:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.categoriaFinanceira || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Modalidade:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.modality || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Centro de Custo:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.costCenter || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tomador:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.client || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Alocação Final:</span>
                  {editingField === 'alocacaoFinal' ? (
                    <div className="flex items-center justify-end gap-2">
                      <StringSingleSelectDropdown
                        value={alocacaoFinal || ''}
                        onChange={(value) => setAlocacaoFinal(value || null)}
                        options={costCentersList}
                        disabled={loadingCostCenters}
                        placeholder={
                          loadingCostCenters
                            ? 'Carregando centros de custo...'
                            : 'Selecione um centro de custo'
                        }
                        emptyOptionsMessage="Nenhum centro de custo disponível"
                        className="w-64"
                      />
                      <button
                        onClick={handleSaveManualValues}
                        disabled={isSaving}
                        className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50"
                        title="Salvar"
                      >
                        <Save className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                        title="Cancelar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => !isPayrollFinalized && setEditingField('alocacaoFinal')}
                      className={`text-sm font-medium text-gray-900 dark:text-gray-100 ${
                        !isPayrollFinalized ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : ''
                      }`}
                      title={isPayrollFinalized ? 'Folha finalizada. Solicite ao financeiro que reabra para editar.' : 'Clique para editar'}
                    >
                      {alocacaoFinal || 'N/A'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Banking Info */}
          <div className="space-y-4 mb-6">
            <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">
              Dados Bancários
            </h4>
            <div className="rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Banco:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.bank || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tipo de Conta:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.accountType || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Agência:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.agency || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Operação:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.operation || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Conta:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.account || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Dígito:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.digit || 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tipo de Chave:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.pixKeyType || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Chave PIX:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.pixKey || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payroll Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              Detalhamento da Folha
            </h3>
            
            <div className="table-scroll shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Cód.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Descrição
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Referência
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Proventos
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Descontos
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {/* Salário Base */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      001
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      SALÁRIO BASE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {employee.daysWorked} dias
                        </span>
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Dias Trabalhados:</div>
                            <div className="space-y-1">
                              <div>📅 Dias úteis do mês: <span className="font-bold text-green-400">{employee.totalWorkingDays || 0}</span></div>
                              <div>❌ Faltas: <span className="font-bold text-red-400">{faltas || 0}</span></div>
                              <div>🏥 Ausências: <span className="font-bold text-yellow-400">{totalAbsences || 0}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Dias trabalhados: <span className="font-bold text-green-400">{employee.daysWorked} dias</span></div>
                              </div>
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Salário Base:</div>
                            <div className="space-y-1">
                              <div>💰 Valor mensal: <span className="font-bold text-green-400">R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              <div className="text-gray-400 mt-2 text-xs">💡 Valor fixo do salário contratual do funcionário</div>
                            </div>
                            <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Periculosidade + Insalubridade */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      002
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      PERICULOSIDADE + INSALUBRIDADE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {employee.dangerPay || 0}% / {employee.unhealthyPay || 0}%
                        </span>
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo de Adicionais:</div>
                            <div className="space-y-1">
                              {employee.dangerPay > 0 && (
                                <div>⚠️ Periculosidade: <span className="font-bold text-blue-400">{employee.dangerPay}% sobre salário</span></div>
                              )}
                              {employee.unhealthyPay > 0 && (
                                <div>🏭 Insalubridade: <span className="font-bold text-blue-400">{employee.unhealthyPay}% sobre R$ 1.518,00</span></div>
                              )}
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>💰 Periculosidade: <span className="font-bold text-green-400">R$ {periculosidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div>💰 Insalubridade: <span className="font-bold text-green-400">R$ {insalubridade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                {descontoPericInsalub > 0 && (
                                  <div className="text-red-400 mt-1">❌ Desconto por faltas: R$ {descontoPericInsalub.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                )}
                              </div>
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {Math.max(0, (periculosidade + insalubridade) - descontoPericInsalub).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Valor Líquido:</div>
                            <div className="space-y-1">
                              <div>💰 Periculosidade: <span className="font-bold text-green-400">R$ {periculosidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              <div>💰 Insalubridade: <span className="font-bold text-green-400">R$ {insalubridade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              {descontoPericInsalub > 0 && (
                                <>
                                  <div>❌ Desconto por faltas: <span className="font-bold text-red-400">- R$ {descontoPericInsalub.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  <div className="border-t border-gray-700 mt-2 pt-2">
                                    <div>✅ Total: <span className="font-bold text-green-400">R$ {Math.max(0, (periculosidade + insalubridade) - descontoPericInsalub).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                      {descontoPericInsalub > 0 ? (
                          <>
                            <span className="cursor-help">
                              R$ {descontoPericInsalub.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                              <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                                <div className="font-semibold mb-2 text-yellow-400">Desconto por Faltas:</div>
                                <div className="space-y-1">
                                  <div>📊 Fórmula: <span className="font-bold text-blue-400">(Periculosidade + Insalubridade) / 30 × Faltas</span></div>
                                  <div className="border-t border-gray-700 mt-2 pt-2">
                                    <div>✅ Desconto: <span className="font-bold text-red-400">R$ {descontoPericInsalub.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  </div>
                                </div>
                                <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                              </div>
                            </div>
                          </>
                      ) : (
                        <>-</>
                      )}
                      </div>
                    </td>
                  </tr>

                  {/* Salário Família */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      003
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      SALÁRIO FAMÍLIA
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {salarioFamilia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {salarioFamilia > 0 && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Salário Família:</div>
                              <div className="space-y-1">
                                <div>💰 Valor: <span className="font-bold text-green-400">R$ {salarioFamilia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Benefício pago a trabalhadores com filhos menores de 14 anos ou inválidos</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Acréscimos */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      004
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      ACRÉSCIMOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {(employee.totalAdjustments || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {(employee.totalAdjustments || 0) > 0 && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Acréscimos:</div>
                              <div className="space-y-1">
                                <div>💰 Total: <span className="font-bold text-green-400">R$ {(employee.totalAdjustments || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Valores adicionais cadastrados manualmente</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Vale Alimentação */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      005
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VALE ALIMENTAÇÃO
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          {daysForVA} dias
                        </span>
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo de VA/VT:</div>
                            <div className="space-y-1">
                              <div>📅 Dias úteis (próximo mês): <span className="font-bold text-green-400">{nextMonthWorkingDays}</span></div>
                              <div>❌ Faltas (mês atual): <span className="font-bold text-red-400">{faltas || 0}</span></div>
                              <div>🏥 Ausências (mês atual): <span className="font-bold text-yellow-400">{totalAbsences || 0}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Total: <span className="font-bold text-green-400">{nextMonthWorkingDays} - {faltas || 0} - {totalAbsences || 0} = {daysForVA} dias</span></div>
                              </div>
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {totalVA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo do Valor:</div>
                            <div className="space-y-1">
                              <div>📊 Referência: <span className="font-bold text-green-400">{daysForVA} dias</span></div>
                              <div>💰 VA Diário: <span className="font-bold text-blue-400">R$ {(employee.dailyFoodVoucher || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Total: <span className="font-bold text-green-400">{daysForVA} × R$ {(employee.dailyFoodVoucher || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = R$ {totalVA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              </div>
                            </div>
                            <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Vale Transporte */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      006
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VALE TRANSPORTE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          {daysForVT} dias
                        </span>
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo de VA/VT:</div>
                            <div className="space-y-1">
                              <div>📅 Dias úteis (próximo mês): <span className="font-bold text-green-400">{nextMonthWorkingDays}</span></div>
                              <div>❌ Faltas (mês atual): <span className="font-bold text-red-400">{faltas || 0}</span></div>
                              <div>🏥 Ausências (mês atual): <span className="font-bold text-yellow-400">{totalAbsences || 0}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Total: <span className="font-bold text-green-400">{nextMonthWorkingDays} - {faltas || 0} - {totalAbsences || 0} = {daysForVA} dias</span></div>
                              </div>
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {totalVT.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo do Valor:</div>
                            <div className="space-y-1">
                              <div>📊 Referência: <span className="font-bold text-green-400">{daysForVT} dias</span></div>
                              <div>💰 VT Diário: <span className="font-bold text-blue-400">R$ {(employee.dailyTransportVoucher || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Total: <span className="font-bold text-green-400">{daysForVT} × R$ {(employee.dailyTransportVoucher || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = R$ {totalVT.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              </div>
                            </div>
                            <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Total Horas Extras */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      007
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      HORAS EXTRAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {((employee.he50Hours || 0) + (employee.he100Hours || 0)).toFixed(2)}h
                        </span>
                        {((employee.he50Hours || 0) + (employee.he100Hours || 0)) > 0 && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Horas Extras:</div>
                              <div className="space-y-1">
                                {(employee.he50Hours || 0) > 0 && (
                                  <div>⏰ HE 50%: <span className="font-bold text-blue-400">{(employee.he50Hours || 0).toFixed(2)}h</span></div>
                                )}
                                {(employee.he100Hours || 0) > 0 && (
                                  <div>⏰ HE 100%: <span className="font-bold text-blue-400">{(employee.he100Hours || 0).toFixed(2)}h</span></div>
                                )}
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ Total: <span className="font-bold text-green-400">{((employee.he50Hours || 0) + (employee.he100Hours || 0)).toFixed(2)}h</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('horasExtras')}
                      title="Clique para editar"
                    >
                      {editingField === 'horasExtras' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={horasExtrasValue === null || horasExtrasValue === 0 ? '' : horasExtrasValue.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setHorasExtrasValue(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative group inline-block">
                          <span className="cursor-help">
                          R$ {valorHorasExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                          {valorHorasExtras > 0 && (
                            <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                              <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                                <div className="font-semibold mb-2 text-yellow-400">Cálculo de Horas Extras:</div>
                                <div className="space-y-1">
                                  {(employee.he50Hours || 0) > 0 && (
                                    <div>💰 HE 50%: <span className="font-bold text-blue-400">{(employee.he50Hours || 0).toFixed(2)}h × R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 1,5 = R$ {(employee.he50Value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {(employee.he100Hours || 0) > 0 && (
                                    <div>💰 HE 100%: <span className="font-bold text-blue-400">{(employee.he100Hours || 0).toFixed(2)}h × R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 2,0 = R$ {(employee.he100Value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  <div className="border-t border-gray-700 mt-2 pt-2">
                                    <div>✅ Total: <span className="font-bold text-green-400">R$ {valorHorasExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  </div>
                                </div>
                                <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* DSR H.E */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      008
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DSR POR HORAS EXTRAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {dsrHE.toFixed(2)}h
                        </span>
                        {dsrHE > 0 && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do DSR H.E:</div>
                              <div className="space-y-1">
                                <div>📅 Total H.E: <span className="font-bold text-blue-400">{((employee.he50Hours || 0) + (employee.he100Hours || 0)).toFixed(2)}h</span></div>
                                <div>📅 Dias úteis: <span className="font-bold text-green-400">{diasUteis} dias</span></div>
                                <div>📅 Dias não úteis: <span className="font-bold text-yellow-400">{diasNaoUteis} dias</span></div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ DSR H.E: <span className="font-bold text-green-400">({((employee.he50Hours || 0) + (employee.he100Hours || 0)).toFixed(2)}h / {diasUteis}) × {diasNaoUteis} = {dsrHE.toFixed(2)}h</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('dsrHE')}
                      title="Clique para editar"
                    >
                      {editingField === 'dsrHE' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={dsrHEValue === null || dsrHEValue === 0 ? '' : dsrHEValue.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setDsrHEValue(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative group inline-block">
                          <span className="cursor-help">
                          R$ {valorDSRHE.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                          {valorDSRHE > 0 && (
                            <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                              <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                                <div className="font-semibold mb-2 text-yellow-400">Cálculo do Valor DSR H.E:</div>
                                <div className="space-y-1">
                                  <div>📊 DSR H.E: <span className="font-bold text-blue-400">{dsrHE.toFixed(2)}h</span></div>
                                  <div>💰 Valor hora: <span className="font-bold text-blue-400">R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  <div className="border-t border-gray-700 mt-2 pt-2">
                                    <div>✅ Total: <span className="font-bold text-green-400">{dsrHE.toFixed(2)}h × R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = R$ {valorDSRHE.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  </div>
                                </div>
                                <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Seção: Outros Descontos */}
                  <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-200 dark:border-blue-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wide">
                        OUTROS DESCONTOS
                      </h4>
                    </td>
                  </tr>

                  {/* Descontos */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      009
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DESCONTOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {(employee.totalDiscounts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {(employee.totalDiscounts || 0) > 0 && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Descontos:</div>
                              <div className="space-y-1">
                                <div>💰 Total: <span className="font-bold text-red-400">R$ {(employee.totalDiscounts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Valores descontados cadastrados manualmente</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Desconto por Faltas */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      010
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FALTAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {faltas || 0} faltas
                        </span>
                        {faltas > 0 && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Faltas:</div>
                              <div className="space-y-1">
                                <div>❌ Total de faltas: <span className="font-bold text-red-400">{faltas || 0}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Faltas não justificadas que resultam em desconto no salário</div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('descontoPorFaltas')}
                      title="Clique para editar"
                    >
                      {editingField === 'descontoPorFaltas' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={descontoPorFaltas === null || descontoPorFaltas === 0 ? '' : descontoPorFaltas.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setDescontoPorFaltas(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative group inline-block">
                          <span className="cursor-help">
                          R$ {descontoPorFaltasFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                          {descontoPorFaltasFinal > 0 && (
                            <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                              <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                                <div className="font-semibold mb-2 text-yellow-400">Cálculo do Desconto por Faltas:</div>
                                <div className="space-y-1">
                                  <div>📊 Faltas: <span className="font-bold text-red-400">{faltas || 0}</span></div>
                                  <div>💰 Salário + Adicionais: <span className="font-bold text-blue-400">R$ {(salarioBase + periculosidade + insalubridade).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  <div>📅 Dias para desconto: <span className="font-bold text-blue-400">{diasParaDesconto} dias</span></div>
                                  <div className="border-t border-gray-700 mt-2 pt-2">
                                    <div>✅ Desconto: <span className="font-bold text-red-400">(R$ {(salarioBase + periculosidade + insalubridade).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {diasParaDesconto}) × {faltas} = R$ {descontoPorFaltasFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  </div>
                                </div>
                                <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* DSR por Falta */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      011
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DSR POR FALTA
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                      <div className="flex flex-col items-center">
                          <span className="font-medium cursor-help">{faltas || 0} falta(s)</span>
                        {referenciaDSR && referenciaDSR !== '-' && (
                          <span className="text-xs mt-1 text-gray-500 dark:text-gray-400">{referenciaDSR}</span>
                          )}
                        </div>
                        {faltas > 0 && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">DSR por Falta:</div>
                              <div className="space-y-1">
                                <div>📊 Faltas: <span className="font-bold text-red-400">{faltas || 0}</span></div>
                                <div>📅 Referência: <span className="font-bold text-blue-400">{referenciaDSR || 'Calculado automaticamente'}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 DSR (Descanso Semanal Remunerado) proporcional às faltas</div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('dsrPorFalta')}
                      title="Clique para editar"
                    >
                      {editingField === 'dsrPorFalta' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={dsrPorFalta === null || dsrPorFalta === 0 ? '' : dsrPorFalta.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setDsrPorFalta(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative group inline-block">
                          <span className="cursor-help">
                          R$ {dsrPorFaltaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                          {dsrPorFaltaFinal > 0 && (
                            <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                              <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                                <div className="font-semibold mb-2 text-yellow-400">Cálculo do DSR por Falta:</div>
                                <div className="space-y-1">
                                  <div>📊 Faltas: <span className="font-bold text-red-400">{faltas || 0}</span></div>
                                  <div>💰 Desconto por faltas: <span className="font-bold text-blue-400">R$ {descontoPorFaltasFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  <div className="text-gray-400 mt-2 text-xs">💡 DSR proporcional calculado sobre o desconto de faltas</div>
                                </div>
                                <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* %VA - Desconto de 9% do VA para funcionários de BRASÍLIA */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      012
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VA%
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          {employee.modality !== 'MEI' ? `(25,2 × ${daysForVA} dias) × 9%` : 'Não aplicável'}
                        </span>
                        {employee.modality !== 'MEI' && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do %VA:</div>
                              <div className="space-y-1">
                                <div>📊 Valor diário VA: <span className="font-bold text-blue-400">R$ 25,20</span></div>
                                <div>📅 Dias de referência: <span className="font-bold text-green-400">{daysForVA} dias</span></div>
                                <div>💰 Valor total VA: <span className="font-bold text-blue-400">R$ 25,20 × {daysForVA} = R$ {(25.2 * daysForVA).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ Desconto 9%: <span className="font-bold text-green-400">R$ {(25.2 * daysForVA).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 9% = R$ {percentualVA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {percentualVA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.modality !== 'MEI' && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do %VA:</div>
                              <div className="space-y-1">
                                <div>📊 Fórmula: <span className="font-bold text-blue-400">(25,2 × {daysForVA} dias) × 9%</span></div>
                                <div>💰 Cálculo: <span className="font-bold text-green-400">R$ {(25.2 * daysForVA).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 9% = R$ {percentualVA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Desconto de 9% sobre o valor total do VA</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* %VT - Desconto de 6% do salário para funcionários de GOIÁS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      013
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VT%
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {employee.polo === 'GOIÁS' ? '6% do salário' : 'Não aplicável'}
                        </span>
                        {employee.polo === 'GOIÁS' && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do %VT:</div>
                              <div className="space-y-1">
                                <div>📊 Polo: <span className="font-bold text-blue-400">GOIÁS</span></div>
                                <div>💰 Salário Base: <span className="font-bold text-green-400">R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ Desconto 6%: <span className="font-bold text-green-400">R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 6% = R$ {percentualVT.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {percentualVT.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.polo === 'GOIÁS' && percentualVT > 0 && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do %VT:</div>
                              <div className="space-y-1">
                                <div>📊 Fórmula: <span className="font-bold text-blue-400">Salário Base × 6%</span></div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ Desconto: <span className="font-bold text-red-400">R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 6% = R$ {percentualVT.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Aplicável apenas para funcionários do polo GOIÁS</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Seção: INSS */}
                  <tr className="bg-orange-50 dark:bg-orange-900/20 border-t-2 border-orange-200 dark:border-orange-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-orange-900 dark:text-orange-300 uppercase tracking-wide">
                        INSS (INSTITUTO NACIONAL DO SEGURO SOCIAL)
                      </h4>
                    </td>
                  </tr>

                  {/* BASE INSS MENSAL */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      014
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      BASE INSS MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Mensal'}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTAGIÁRIO' && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-80">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Base de Cálculo do INSS:</div>
                              <div className="space-y-1">
                                <div>📊 A base INSS é calculada sobre:</div>
                                <div className="ml-2 space-y-1">
                                  <div>• Salário Base: <span className="font-bold text-green-400">R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  {periculosidade > 0 && <div>• Periculosidade: <span className="font-bold text-green-400">R$ {periculosidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                                  {insalubridade > 0 && <div>• Insalubridade: <span className="font-bold text-green-400">R$ {insalubridade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                                  {valorHorasExtras > 0 && <div>• Horas Extras: <span className="font-bold text-green-400">R$ {valorHorasExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                                  {valorDSRHE > 0 && <div>• DSR H.E: <span className="font-bold text-green-400">R$ {valorDSRHE.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                                  {descontoPorFaltasFinal > 0 && <div>• Desconto Faltas: <span className="font-bold text-red-400">- R$ {descontoPorFaltasFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                                  {dsrPorFaltaFinal > 0 && <div>• DSR Falta: <span className="font-bold text-red-400">- R$ {dsrPorFaltaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                                </div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ Base INSS: <span className="font-bold text-green-400">R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTAGIÁRIO' && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-80">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo da Base INSS:</div>
                              <div className="space-y-1">
                                <div>💰 Fórmula: <span className="font-bold text-blue-400">(Salário + Adicionais + HE + DSR HE) - Descontos</span></div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ Base INSS: <span className="font-bold text-green-400">R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Esta base será usada para calcular o INSS com a tabela progressiva</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* INSS MENSAL */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      015
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela Progressiva'}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTAGIÁRIO' && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-80">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Tabela Progressiva INSS:</div>
                              <div className="space-y-1">
                                <div>📊 Base INSS: <span className="font-bold text-green-400">R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-xs mt-2 space-y-1">
                                  {baseINSSMensal <= 1621.0 && (
                                    <div>• Faixa 1 (até R$ 1.621,00): <span className="font-bold text-blue-400">7,5%</span></div>
                                  )}
                                  {baseINSSMensal > 1621.0 && baseINSSMensal <= 2902.84 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 1.621,00): <span className="font-bold text-blue-400">7,5%</span></div>
                                      <div>• Faixa 2 (R$ 1.621,01 até R$ 2.902,84): <span className="font-bold text-blue-400">9%</span></div>
                                    </>
                                  )}
                                  {baseINSSMensal > 2902.84 && baseINSSMensal <= 4354.27 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 1.621,00): <span className="font-bold text-blue-400">7,5%</span></div>
                                      <div>• Faixa 2 (R$ 1.621,01 até R$ 2.902,84): <span className="font-bold text-blue-400">9%</span></div>
                                      <div>• Faixa 3 (R$ 2.902,85 até R$ 4.354,27): <span className="font-bold text-blue-400">12%</span></div>
                                    </>
                                  )}
                                  {baseINSSMensal > 4354.27 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 1.621,00): <span className="font-bold text-blue-400">7,5%</span></div>
                                      <div>• Faixa 2 (R$ 1.621,01 até R$ 2.902,84): <span className="font-bold text-blue-400">9%</span></div>
                                      <div>• Faixa 3 (R$ 2.902,85 até R$ 4.354,27): <span className="font-bold text-blue-400">12%</span></div>
                                      <div>• Faixa 4 (R$ 4.354,28 até R$ 8.475,55): <span className="font-bold text-blue-400">14%</span></div>
                                    </>
                                  )}
                                </div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ INSS Calculado: <span className="font-bold text-green-400">R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTAGIÁRIO' && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-80">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do INSS Mensal:</div>
                              <div className="space-y-1">
                                <div>📊 Base INSS: <span className="font-bold text-blue-400">R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-xs mt-2">
                                  {baseINSSMensal <= 1621.0 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 7,5% = R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {baseINSSMensal > 1621.0 && baseINSSMensal <= 2902.84 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ 1.621,00 × 7,5%) + (R$ {(baseINSSMensal - 1621.0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 9%) = R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {baseINSSMensal > 2902.84 && baseINSSMensal <= 4354.27 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ 1.621,00 × 7,5%) + (R$ 1.281,84 × 9%) + (R$ {(baseINSSMensal - 2902.84).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 12%) = R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {baseINSSMensal > 4354.27 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ 1.621,00 × 7,5%) + (R$ 1.281,84 × 9%) + (R$ 1.451,43 × 12%) + (R$ {Math.min(baseINSSMensal - 4354.27, 4121.28).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 14%) = R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                </div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Teto máximo: R$ 8.475,55</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* BASE INSS FÉRIAS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      016
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      BASE INSS FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          {employee.modality === 'MEI' || employee.modality === 'ESTÁGIO' ? 'Não aplicável' : `${employee.vacationDays || 0} dias`}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTÁGIO' && (employee.vacationDays || 0) > 0 && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Base INSS Férias:</div>
                              <div className="space-y-1">
                                <div>📅 Dias de férias: <span className="font-bold text-green-400">{employee.vacationDays || 0} dias</span></div>
                                <div>💰 Base: <span className="font-bold text-blue-400">R$ {(employee.baseInssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Base de cálculo do INSS sobre férias (1/3 de férias)</div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          R$ {(employee.baseInssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTÁGIO' && (employee.baseInssFerias || 0) > 0 && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Base INSS Férias:</div>
                              <div className="space-y-1">
                                <div>💰 Valor: <span className="font-bold text-green-400">R$ {(employee.baseInssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Base para cálculo do INSS sobre férias</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* INSS FÉRIAS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      017
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          {employee.modality === 'MEI' || employee.modality === 'ESTÁGIO' ? 'Não aplicável' : 'Sobre férias'}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTÁGIO' && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">INSS Férias:</div>
                              <div className="space-y-1">
                                <div>📊 Base INSS Férias: <span className="font-bold text-blue-400">R$ {(employee.baseInssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div>💰 INSS calculado: <span className="font-bold text-green-400">R$ {(employee.inssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 INSS calculado sobre a base de férias usando tabela progressiva</div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          R$ {(employee.inssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTÁGIO' && (employee.inssFerias || 0) > 0 && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">INSS Férias:</div>
                              <div className="space-y-1">
                                <div>💰 Valor: <span className="font-bold text-red-400">R$ {(employee.inssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-gray-400 mt-2 text-xs">💡 INSS calculado sobre férias usando tabela progressiva</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* INSS RESCISÃO */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      018
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS RESCISÃO
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Manual
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('inssRescisao')}
                      title="Clique para editar"
                    >
                      {editingField === 'inssRescisao' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={inssRescisao === 0 ? '' : inssRescisao.toString()}
                            onChange={(e) => {
                              if (isPayrollFinalized) return;
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setInssRescisao(parseFloat(value.replace(',', '.')) || 0);
                            }}
                            disabled={isPayrollFinalized}
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving || isPayrollFinalized}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title={isPayrollFinalized ? 'Folha finalizada. Não é possível salvar.' : 'Salvar'}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      ) : inssRescisao > 0 ? (
                        <div 
                          className={`px-2 py-1 rounded text-right ${isPayrollFinalized ? 'text-gray-500 dark:text-gray-500 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          onClick={() => !isPayrollFinalized && setEditingField('inssRescisao')}
                          title={isPayrollFinalized ? 'Folha finalizada. Solicite ao financeiro que reabra para editar.' : 'Clique para editar'}
                        >
                          R$ {inssRescisao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <button
                            onClick={() => !isPayrollFinalized && setEditingField('inssRescisao')}
                            disabled={isPayrollFinalized}
                            className={`flex items-center justify-center gap-1 px-3 py-1 text-xs rounded-full transition-colors ${
                              isPayrollFinalized 
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' 
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                            }`}
                            title={isPayrollFinalized ? 'Folha finalizada. Solicite ao financeiro que reabra para editar.' : 'Adicionar valor'}
                          >
                            +
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* INSS 13° */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      019
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS 13°
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Manual
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('inss13')}
                      title="Clique para editar"
                    >
                      {editingField === 'inss13' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={inss13 === 0 ? '' : inss13.toString()}
                            onChange={(e) => {
                              if (isPayrollFinalized) return;
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setInss13(parseFloat(value.replace(',', '.')) || 0);
                            }}
                            disabled={isPayrollFinalized}
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving || isPayrollFinalized}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title={isPayrollFinalized ? 'Folha finalizada. Não é possível salvar.' : 'Salvar'}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      ) : inss13 > 0 ? (
                        <div 
                          className={`px-2 py-1 rounded text-right ${isPayrollFinalized ? 'text-gray-500 dark:text-gray-500 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          onClick={() => !isPayrollFinalized && setEditingField('inss13')}
                          title={isPayrollFinalized ? 'Folha finalizada. Solicite ao financeiro que reabra para editar.' : 'Clique para editar'}
                        >
                          R$ {inss13.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <button
                            onClick={() => !isPayrollFinalized && setEditingField('inss13')}
                            disabled={isPayrollFinalized}
                            className={`flex items-center justify-center gap-1 px-3 py-1 text-xs rounded-full transition-colors ${
                              isPayrollFinalized 
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' 
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                            }`}
                            title={isPayrollFinalized ? 'Folha finalizada. Solicite ao financeiro que reabra para editar.' : 'Adicionar valor'}
                          >
                            +
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* INSS Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-orange-50/50 dark:bg-orange-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      020
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-orange-900 dark:text-orange-300 border-r border-gray-200 dark:border-gray-700">
                      INSS TOTAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Soma
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.inssTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Seção: IRRF */}
                  <tr className="bg-purple-50 dark:bg-purple-900/20 border-t-2 border-purple-200 dark:border-purple-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wide">
                        IRRF (IMPOSTO DE RENDA RETIDO NA FONTE)
                      </h4>
                    </td>
                  </tr>

                  {/* IRRF Mensal */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      021
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                          {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela 2026'}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTAGIÁRIO' && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-80">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Tabela IRRF 2026:</div>
                              <div className="space-y-1">
                                <div>📊 Base IRRF: <span className="font-bold text-green-400">R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-xs mt-2 space-y-1">
                                  <div>• Salário Bruto: <span className="font-bold text-blue-400">R$ {salarioBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  <div>• Dedução padrão: <span className="font-bold text-red-400">- R$ 607,20</span></div>
                                  <div className="border-t border-gray-700 mt-1 pt-1">
                                    <div>✅ Base IRRF: <span className="font-bold text-green-400">R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  </div>
                                </div>
                                <div className="text-xs mt-2 space-y-1">
                                  {baseIRRF <= 5000.00 && (
                                    <div>• Faixa 1 (até R$ 5.000,00): <span className="font-bold text-blue-400">Isento</span></div>
                                  )}
                                  {baseIRRF > 5000.00 && baseIRRF <= 7423.07 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 5.000,00): <span className="font-bold text-blue-400">Isento</span></div>
                                      <div>• Faixa 2 (R$ 5.000,01 até R$ 7.423,07): <span className="font-bold text-blue-400">7,5% - R$ 375,00</span></div>
                                    </>
                                  )}
                                  {baseIRRF > 7423.07 && baseIRRF <= 9850.63 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 5.000,00): <span className="font-bold text-blue-400">Isento</span></div>
                                      <div>• Faixa 2 (R$ 5.000,01 até R$ 7.423,07): <span className="font-bold text-blue-400">7,5% - R$ 375,00</span></div>
                                      <div>• Faixa 3 (R$ 7.423,08 até R$ 9.850,63): <span className="font-bold text-blue-400">15% - R$ 738,46</span></div>
                                    </>
                                  )}
                                  {baseIRRF > 9850.63 && baseIRRF <= 12249.92 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 5.000,00): <span className="font-bold text-blue-400">Isento</span></div>
                                      <div>• Faixa 2 (R$ 5.000,01 até R$ 7.423,07): <span className="font-bold text-blue-400">7,5% - R$ 375,00</span></div>
                                      <div>• Faixa 3 (R$ 7.423,08 até R$ 9.850,63): <span className="font-bold text-blue-400">15% - R$ 738,46</span></div>
                                      <div>• Faixa 4 (R$ 9.850,64 até R$ 12.249,92): <span className="font-bold text-blue-400">22,5% - R$ 1.284,59</span></div>
                                    </>
                                  )}
                                  {baseIRRF > 12249.92 && (
                                    <>
                                      <div>• Faixa 1 (até R$ 5.000,00): <span className="font-bold text-blue-400">Isento</span></div>
                                      <div>• Faixa 2 (R$ 5.000,01 até R$ 7.423,07): <span className="font-bold text-blue-400">7,5% - R$ 375,00</span></div>
                                      <div>• Faixa 3 (R$ 7.423,08 até R$ 9.850,63): <span className="font-bold text-blue-400">15% - R$ 738,46</span></div>
                                      <div>• Faixa 4 (R$ 9.850,64 até R$ 12.249,92): <span className="font-bold text-blue-400">22,5% - R$ 1.284,59</span></div>
                                      <div>• Faixa 5 (acima de R$ 12.249,92): <span className="font-bold text-blue-400">27,5% - R$ 1.944,42</span></div>
                                    </>
                                  )}
                                </div>
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                  <div>✅ IRRF Calculado: <span className="font-bold text-green-400">R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                </div>
                              </div>
                              <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      <div className="relative group inline-block">
                        <span className="cursor-help">
                      R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {employee.modality !== 'MEI' && employee.modality !== 'ESTAGIÁRIO' && (
                          <div className="absolute right-0 transform translate-x-0 bottom-full mb-2 hidden group-hover:block z-50 w-80">
                            <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                              <div className="font-semibold mb-2 text-yellow-400">Cálculo do IRRF Mensal:</div>
                              <div className="space-y-1">
                                <div>📊 Base IRRF: <span className="font-bold text-blue-400">R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                <div className="text-xs mt-2">
                                  {baseIRRF <= 5000.00 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">Isento (base ≤ R$ 5.000,00)</span></div>
                                  )}
                                  {baseIRRF > 5000.00 && baseIRRF <= 7423.07 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 7,5%) - R$ 375,00 = R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {baseIRRF > 7423.07 && baseIRRF <= 9850.63 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 15%) - R$ 738,46 = R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {baseIRRF > 9850.63 && baseIRRF <= 12249.92 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 22,5%) - R$ 1.284,59 = R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                  {baseIRRF > 12249.92 && (
                                    <div>💰 Cálculo: <span className="font-bold text-green-400">(R$ {baseIRRF.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × 27,5%) - R$ 1.944,42 = R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                </div>
                                <div className="text-gray-400 mt-2 text-xs">💡 Base IRRF = Salário Bruto - R$ 607,20</div>
                              </div>
                              <div className="absolute right-4 transform translate-x-0 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* IRRF Férias */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      022
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela 2026'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.irrfFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* IRRF Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-purple-50/50 dark:bg-purple-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      023
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-purple-900 dark:text-purple-300 border-r border-gray-200 dark:border-gray-700">
                      IRRF TOTAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Soma
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.irrfTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* DCTFWEB */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-indigo-50/50 dark:bg-indigo-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      024
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-indigo-900 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700">
                      DCTFWEB
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Cálculo
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {Math.max(0, dctfweb).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Seção: FGTS */}
                  <tr className="bg-green-50 dark:bg-green-900/20 border-t-2 border-green-200 dark:border-green-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-green-900 dark:text-green-300 uppercase tracking-wide">
                        FGTS (FUNDO DE GARANTIA DO TEMPO DE SERVIÇO)
                      </h4>
                    </td>
                  </tr>

                  {/* FGTS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      025
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FGTS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : '8%'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.fgts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* FGTS Férias */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      026
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FGTS FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : '8%'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.fgtsFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* FGTS Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-green-50/50 dark:bg-green-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      027
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-green-900 dark:text-green-300 border-r border-gray-200 dark:border-gray-700">
                      FGTS TOTAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Soma
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.fgtsTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-8">
              <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
                Resumo Financeiro
              </h4>
              <div className="rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {/* Total dos Vencimentos */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Proventos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      R$ {totalProventos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total dos Proventos
                    </div>
                  </div>

                  {/* Total dos Descontos */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descontos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      R$ {totalDescontos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total dos Descontos
                    </div>
                  </div>

                  {/* Líquido a Receber */}
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <span className="text-xs font-medium text-blue-100 uppercase tracking-wide">Líquido</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      R$ {liquidoReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-blue-100">
                      Valor a Receber
                    </div>
                  </div>

                </div>
                
                {/* Segunda linha com acréscimos e líquido total */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Total dos Acréscimos */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Acréscimos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      R$ {(employee.totalAdjustments || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total dos Acréscimos
                    </div>
                  </div>

                  {/* Líquido com Acréscimos */}
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <span className="text-xs font-medium text-purple-100 uppercase tracking-wide">Líquido Total</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      R$ {liquidoComAcrescimos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-purple-100">
                      Com Acréscimos
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cards de Horas Extras */}
          <div className="mt-6">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
              Horas Extras
            </h4>
            <div className="rounded-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card H.E 50% */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">H.E 50%</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Horas extras com adicional de 50%</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total de Horas:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {(employee.he50Hours || 0).toFixed(2)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor por Hora:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border-t dark:border-gray-700 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total:</span>
                        <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                          R$ {(employee.he50Value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card H.E 100% */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                        <Moon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">H.E 100%</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Horas extras com adicional de 100%</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total de Horas:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {(employee.he100Hours || 0).toFixed(2)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor por Hora:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border-t dark:border-gray-700 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total:</span>
                        <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                          R$ {(employee.he100Value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Info */}
          <div className="mt-6">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
              Informações de Presença
            </h4>
            <div className="rounded-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Total de Dias Úteis */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Úteis</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {employee.totalWorkingDays}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Dias Úteis
                  </div>
                </div>
                
                {/* Dias Trabalhados do Mês Atual */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trabalhados</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {employee.daysWorked}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Dias Trabalhados
                  </div>
                </div>

                {/* Faltas */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Faltas</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {faltas || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Total de Faltas
                  </div>
                </div>

                {/* Ausências */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ausências</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {totalAbsences || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Ausências Justificadas
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Gênnesis Engenharia - Folha de Pagamento de {monthName} de {year}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
