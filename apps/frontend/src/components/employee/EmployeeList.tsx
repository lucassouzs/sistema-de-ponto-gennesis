'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Users, Search, AlertTriangle, X, Clock, Calendar, User, Download, Edit, Save, ChevronDown, ChevronUp, Filter, Camera, FileCheck, Eye, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { AdjustmentsList } from './AdjustmentsList';
import { AdjustmentForm } from './AdjustmentForm';
import { DiscountsList } from './DiscountsList';
import { DiscountForm } from './DiscountForm';
import api from '@/lib/api';
import { SalaryAdjustment, CreateAdjustmentData, UpdateAdjustmentData, SalaryDiscount, CreateDiscountData, UpdateDiscountData } from '@/types';

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
    costCenter?: string;
    client?: string;
    company?: string;
    currentContract?: string;
    bank?: string;
    accountType?: string;
    agency?: string;
    operation?: string;
    account?: string;
    digit?: string;
    pixKeyType?: string;
    pixKey?: string;
    // Novos campos - Modalidade e Adicionais
    modality?: string;
    familySalary?: number;
    dangerPay?: number;
    unhealthyPay?: number;
  };
}

interface EmployeeListProps {
  userRole: string;
  showDeleteButton?: boolean;
}

export function EmployeeList({ userRole, showDeleteButton = true }: EmployeeListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);
  const [viewingCertificate, setViewingCertificate] = useState<string | null>(null);
  const [showAddAdjustmentForm, setShowAddAdjustmentForm] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<SalaryAdjustment | null>(null);
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  const [isAdjustmentsMinimized, setIsAdjustmentsMinimized] = useState(true);
  const [showAddDiscountForm, setShowAddDiscountForm] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<SalaryDiscount | null>(null);
  const [discounts, setDiscounts] = useState<SalaryDiscount[]>([]);
  const [isDiscountsMinimized, setIsDiscountsMinimized] = useState(true);
  const [editForm, setEditForm] = useState<{
    type: string;
    timestamp: string;
    reason: string;
    observation: string;
  }>({
    type: '',
    timestamp: '',
    reason: '',
    observation: ''
  });

  const queryClient = useQueryClient();

  // Listas de opções para filtros
  const departments = [
    'Todos',
    'Engenharia Civil',
    'Engenharia Elétrica',
    'Engenharia Mecânica',
    'Engenharia de Software',
    'Recursos Humanos',
    'Financeiro',
    'Comercial',
    'Marketing',
    'Operações',
    'Qualidade',
    'Segurança do Trabalho',
    'Administrativo',
    'Tecnologia da Informação',
    'Projetos',
    'Manutenção',
    'Produção',
    'Vendas',
    'Atendimento ao Cliente',
    'Jurídico',
    'Contabilidade',
    'Compras',
    'Almoxarifado'
  ];

  const positions = [
    'Todos',
    'Analista',
    'Assistente',
    'Coordenador',
    'Diretor',
    'Engenheiro',
    'Especialista',
    'Estagiário',
    'Gerente',
    'Líder Técnico',
    'Operador',
    'Supervisor',
    'Técnico',
    'Consultor',
    'Desenvolvedor',
    'Designer',
    'Arquiteto',
    'Projetista',
    'Inspetor',
    'Auditor',
    'Contador',
    'Advogado',
    'Vendedor',
    'Atendente',
    'Auxiliar',
    'Secretário',
    'Recepcionista',
    'Motorista',
    'Segurança',
    'Limpeza',
    'Manutenção'
  ];

  const costCenters = [
    'Todos',
    'SEDES',
    'DF - ADM LOCAL',
    'ITAMARATY - SERVIÇOS EVENTUAIS',
    'ITAMARATY - MÃO DE OBRA',
    'SES GDF - LOTE 14',
    'SES GDF - LOTE 10',
    'ADM CENTRAL ENGPAC',
    'DIRETOR'
  ];

  const clients = [
    'Todos',
    '004 - ADMINISTRATIVO DF',
    '017 - CODEVASF',
    '022 - UFRN 2',
    '056 - SUPERINTENDENCIA REGIONAL DA RFB NA 4A R',
    '058 - INCRA NATAL',
    '064 - UFRN PINTURA',
    '068 - PARQUE 3 RUAS - JOÃO PESSOA',
    '069 - SUBSECAO JUDICIARIA ANAPOLIS-GO',
    '070 - SUBSECAO JUDICIARIA RIO VERDE-GO',
    '071 - SUBSECAO JUDICIARIA ITUMBIARA-GO',
    '072 - SUBSECAO JUDICIARIA LUZIANIA-GO',
    '073 - SUBSECAO JUDICIARIA URUACU-GO',
    '074 - SUBSECAO JUDICIARIA FORMOSA-GO',
    '075 - SUBSECAO JUDICIARIA JATAI-GO',
    '076 - MIN DAS RELAÇÕES EXTERIORES -ITAMARATY',
    '077 - SEDES - SEC EST DESENVOLVIMENTO SOCIAL DF',
    '078 - SES - SEC ESTADO DE SAUDE -TAGUATINGA',
    '079 - SES - SEC ESTADO DE SAUDE -CEILANDIA',
    '080 - SES - SEC ESTADO DE SAUDE -SAMAMBAIA/REC',
    '085 - ADMINISTRATIVO RS',
    '086 - CORREIOS E TELEGRAFOS 824 SE/RS',
    '087 - TRE RIO GRANDE DO SUL',
    '088 - BANRISUL',
    '090 - INMETRO RS',
    '092 - TJGO RETROFIT ITAJA',
    '093 - TJGO RETROFIT CAÇU',
    '094 - TJGO RETROFIT PARANAIGUARA',
    '096 - BANCO DO BRASIL GOIAS',
    '097 - SEINFRA PAVIMENTACAO PB',
    '098 - UFPE IMPERMEABILIZAÇÃO',
    '099 - TRIBUNAL DE JUSTICA DE GOIAS - RIO VERDE',
    '100 - TRIBUNAL DE JUSTICA DE GOIAS - CALDAS NOVAS',
    '102 - TJ GO RETROFIT LOTE 05',
    '103 - TJ GO RETROFIT LOTE 04',
    '106 - SMED RS 17/2023 LOTE 01 - REGIAO NORTE',
    '107 - BANCO DO BRASIL JARDIM AMERICA',
    '108 - BANCO DO BRASIL FORMOSA',
    '109 - CORREIOS DA SE/RS',
    '110 - NOVO PROGRESSO'
  ];

  // Função para agrupar registros por dia
  const groupRecordsByDay = (records: any[]) => {
    const grouped = records.reduce((acc: Record<string, any[]>, record: any) => {
      const date = new Date(record.timestamp).toLocaleDateString('pt-BR');
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(record);
      return acc;
    }, {} as Record<string, any[]>);

    // Ordenar registros dentro de cada dia por tipo e timestamp
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a: any, b: any) => {
        // Definir ordem de prioridade dos tipos
        const typeOrder = {
          'ENTRY': 1,
          'LUNCH_START': 2,
          'LUNCH_END': 3,
          'EXIT': 4
        };
        
        const aOrder = typeOrder[a.type as keyof typeof typeOrder] || 999;
        const bOrder = typeOrder[b.type as keyof typeof typeOrder] || 999;
        
        // Se os tipos são diferentes, ordenar por tipo
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        
        // Se os tipos são iguais, ordenar por timestamp
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
    });

    return grouped;
  };

  // Função para exportar registros como XLSX
  const exportToExcel = () => {
    if (!selectedEmployee || !employeeRecordsData?.data) return;

    const records = employeeRecordsData.data;
    const groupedRecords = groupRecordsByDay(records);

    // Preparar dados para exportação
    const exportData = [];
    
    // Cabeçalho com informações do funcionário
    exportData.push(['INFORMAÇÕES DO FUNCIONÁRIO']);
    exportData.push(['Nome:', selectedEmployee.name]);
    exportData.push(['Email:', selectedEmployee.email]);
    exportData.push(['CPF:', selectedEmployee.cpf]);
    exportData.push(['Matrícula:', selectedEmployee.employee?.employeeId || 'N/A']);
    exportData.push(['Setor:', selectedEmployee.employee?.department || 'N/A']);
    exportData.push(['Cargo:', selectedEmployee.employee?.position || 'N/A']);
    exportData.push(['Data de Admissão:', selectedEmployee.employee?.hireDate ? 
      new Date(selectedEmployee.employee.hireDate).toLocaleDateString('pt-BR') : 'N/A']);
    exportData.push(['Centro de Custo:', selectedEmployee.employee?.costCenter || 'N/A']);
    exportData.push(['Tomador:', selectedEmployee.employee?.client || 'N/A']);
    exportData.push(['Período:', `${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`]);
    exportData.push(['']); // Linha em branco

    // Cabeçalho dos registros
    exportData.push([
      'Data',
      'Entrada',
      'Almoço',
      'Retorno',
      'Saída',
      'Motivo de Alterações'
    ]);

    // Dados agrupados por dia - ordenar por data
    Object.entries(groupedRecords)
      .sort(([a], [b]) => {
        // Converter strings de data para objetos Date para ordenação correta
        const dateA = new Date(a.split('/').reverse().join('-'));
        const dateB = new Date(b.split('/').reverse().join('-'));
        return dateA.getTime() - dateB.getTime();
      })
      .forEach(([date, dayRecords]) => {
      const dayData = {
        date: date,
        entrada: '',
        almoco: '',
        retorno: '',
        saida: '',
        observacoes: [] as string[]
      };

      // Processar registros do dia
      dayRecords.forEach((record: any) => {
        const date = new Date(record.timestamp);
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = date.getUTCSeconds().toString().padStart(2, '0');
        const time = `${hours}:${minutes}:${seconds}`;

        switch (record.type) {
          case 'ENTRY':
            dayData.entrada = time;
            break;
          case 'LUNCH_START':
            dayData.almoco = time;
            break;
          case 'LUNCH_END':
            dayData.retorno = time;
            break;
          case 'EXIT':
            dayData.saida = time;
            break;
        }

        // Adicionar motivo de alterações se existirem (exceto localização registrada)
        if (record.reason && !record.reason.includes('Localização registrada')) {
          dayData.observacoes.push(`${time} - ${record.reason}`);
        }
      });

      // Adicionar linha do dia
      exportData.push([
        dayData.date,
        dayData.entrada,
        dayData.almoco,
        dayData.retorno,
        dayData.saida,
        dayData.observacoes.join('; ')
      ]);
    });

    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registros de Ponto');

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 12 }, // Data
      { wch: 10 }, // Entrada
      { wch: 12 }, // Início Almoço
      { wch: 12 }, // Fim Almoço
      { wch: 10 }, // Saída
      { wch: 40 }  // Motivo de Alterações
    ];

    // Estilizar cabeçalho do funcionário
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let row = 0; row <= 8; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
      if (!ws[cellRef]) ws[cellRef] = { v: '' };
      ws[cellRef].s = { font: { bold: true } };
    }

    // Estilizar cabeçalho dos registros
    const headerRow = 9;
    for (let col = 0; col <= 5; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRow, c: col });
      if (!ws[cellRef]) ws[cellRef] = { v: '' };
      ws[cellRef].s = { 
        font: { bold: true }, 
        fill: { fgColor: { rgb: "E3F2FD" } },
        alignment: { horizontal: "center" }
      };
    }

    // Gerar nome do arquivo
    const fileName = `registros_${selectedEmployee.name.replace(/\s+/g, '_')}_${selectedMonth.toString().padStart(2, '0')}_${selectedYear}.xlsx`;
    
    // Download
    XLSX.writeFile(wb, fileName);
  };

  // Buscar funcionários
  const { data: employeesData, isLoading, error } = useQuery({
    queryKey: ['employees', searchTerm, currentPage, statusFilter],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { 
          search: searchTerm, 
          page: currentPage,
          limit: itemsPerPage,
          status: statusFilter
        }
      });
      return res.data;
    },
    enabled: userRole === 'ADMIN' || userRole === 'HR',
  });


  // Buscar registros de ponto do funcionário selecionado
  const { data: employeeRecordsData, isLoading: loadingRecords } = useQuery({
    queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear],
    enabled: !!selectedEmployee,
    queryFn: async () => {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      
      const res = await api.get('/time-records', {
        params: {
          userId: selectedEmployee?.id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          limit: 1000
        }
      });
      return res.data;
    }
  });

  // Deletar funcionário
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await api.delete(`/users/${employeeId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      console.error('Erro ao deletar funcionário:', error);
    }
  });

  // Atualizar registro de ponto
  const updateRecordMutation = useMutation({
    mutationFn: async ({ recordId, data }: { recordId: string; data: any }) => {
      const res = await api.put(`/time-records/${recordId}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear] });
      setEditingRecord(null);
      setEditForm({ type: '', timestamp: '', reason: '', observation: '' } as any);
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar registro:', error);
    }
  });

  // Buscar acréscimos do funcionário
  const { data: adjustmentsData } = useQuery({
    queryKey: ['salary-adjustments', selectedEmployee?.employee?.id],
    queryFn: async () => {
      if (!selectedEmployee?.employee?.id) return { data: [] };
      const res = await api.get(`/salary-adjustments/employee/${selectedEmployee.employee.id}`);
      return res.data;
    },
    enabled: !!selectedEmployee?.employee?.id
  });

  // Atualizar lista de acréscimos quando os dados mudarem
  React.useEffect(() => {
    if (adjustmentsData?.data) {
      setAdjustments(adjustmentsData.data);
    }
  }, [adjustmentsData]);

  // Criar acréscimo
  const createAdjustmentMutation = useMutation({
    mutationFn: async (data: CreateAdjustmentData) => {
      const res = await api.post('/salary-adjustments', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments', selectedEmployee?.employee?.id] });
      setShowAddAdjustmentForm(false);
    }
  });

  // Atualizar acréscimo
  const updateAdjustmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAdjustmentData }) => {
      const res = await api.put(`/salary-adjustments/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments', selectedEmployee?.employee?.id] });
      setEditingAdjustment(null);
    }
  });

  // Deletar acréscimo
  const deleteAdjustmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/salary-adjustments/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments', selectedEmployee?.employee?.id] });
    }
  });

  // Buscar descontos do funcionário
  const { data: discountsData } = useQuery({
    queryKey: ['salary-discounts', selectedEmployee?.employee?.id],
    queryFn: async () => {
      if (!selectedEmployee?.employee?.id) return { data: [] };
      const res = await api.get(`/salary-discounts/employee/${selectedEmployee.employee.id}`);
      return res.data;
    },
    enabled: !!selectedEmployee?.employee?.id
  });

  // Atualizar lista de descontos quando os dados mudarem
  React.useEffect(() => {
    if (discountsData?.data) {
      setDiscounts(discountsData.data);
    }
  }, [discountsData]);

  // Criar desconto
  const createDiscountMutation = useMutation({
    mutationFn: async (data: CreateDiscountData) => {
      const res = await api.post('/salary-discounts', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-discounts', selectedEmployee?.employee?.id] });
      setShowAddDiscountForm(false);
    }
  });

  // Atualizar desconto
  const updateDiscountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateDiscountData }) => {
      const res = await api.put(`/salary-discounts/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-discounts', selectedEmployee?.employee?.id] });
      setEditingDiscount(null);
    }
  });

  // Deletar desconto
  const deleteDiscountMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/salary-discounts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-discounts', selectedEmployee?.employee?.id] });
    }
  });

  const handleDelete = (employeeId: string) => {
    deleteEmployeeMutation.mutate(employeeId);
  };

  const handleEditRecord = (record: any) => {
    setEditingRecord(record.id);
    
    // Converter timestamp para formato local sem conversão de timezone
    const date = new Date(record.timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    setEditForm({
      type: record.type,
      timestamp: localTimestamp,
      reason: (record.reason && !record.reason.includes('Localização registrada')) ? record.reason : '',
      observation: record.observation || ''
    });
  };

  const handleSaveEdit = () => {
    if (editingRecord) {
      updateRecordMutation.mutate({
        recordId: editingRecord,
        data: editForm
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditForm({ type: '', timestamp: '', reason: '', observation: '' });
  };

  // Handlers para acréscimos salariais
  const handleAddAdjustment = (data: CreateAdjustmentData | UpdateAdjustmentData) => {
    if ('employeeId' in data) {
      // É CreateAdjustmentData
      createAdjustmentMutation.mutate(data as CreateAdjustmentData);
    } else {
      // É UpdateAdjustmentData
      if (editingAdjustment) {
        updateAdjustmentMutation.mutate({
          id: editingAdjustment.id,
          data: data as UpdateAdjustmentData
        });
      }
    }
  };

  const handleUpdateAdjustment = (data: UpdateAdjustmentData) => {
    if (editingAdjustment) {
      updateAdjustmentMutation.mutate({
        id: editingAdjustment.id,
        data
      });
    }
  };

  const handleDeleteAdjustment = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este acréscimo?')) {
      deleteAdjustmentMutation.mutate(id);
    }
  };

  const handleEditAdjustment = (adjustment: SalaryAdjustment) => {
    setEditingAdjustment(adjustment);
    setIsAdjustmentsMinimized(false);
  };

  // Funções para manipular descontos
  const handleAddDiscount = (data: CreateDiscountData | UpdateDiscountData) => {
    if ('employeeId' in data) {
      // É CreateDiscountData
      createDiscountMutation.mutate(data as CreateDiscountData);
    } else {
      // É UpdateDiscountData
      if (editingDiscount) {
        updateDiscountMutation.mutate({
          id: editingDiscount.id,
          data: data as UpdateDiscountData
        });
      }
    }
  };

  const handleUpdateDiscount = (data: UpdateDiscountData) => {
    if (editingDiscount) {
      updateDiscountMutation.mutate({
        id: editingDiscount.id,
        data
      });
    }
  };

  const handleEditDiscount = (discount: SalaryDiscount) => {
    setEditingDiscount(discount);
    setShowAddDiscountForm(false);
    setIsDiscountsMinimized(false);
  };

  const handleDeleteDiscount = (id: string) => {
    if (confirm('Tem certeza que deseja remover este desconto?')) {
      deleteDiscountMutation.mutate(id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const employees = employeesData?.data || [];
  const pagination = employeesData?.pagination || { total: 0, totalPages: 0 };

  // Filtrar apenas funcionários (não RH/Admin) e por todos os filtros
  const filteredEmployees = employees.filter((emp: Employee) => {
    const isEmployee = emp.role === 'EMPLOYEE';
    
    const matchesDepartment = departmentFilter === 'all' || 
      (emp.employee?.department && emp.employee.department.toLowerCase().includes(departmentFilter.toLowerCase()));
    
    const matchesPosition = positionFilter === 'all' || 
      (emp.employee?.position && emp.employee.position.toLowerCase().includes(positionFilter.toLowerCase()));
    
    const matchesCostCenter = costCenterFilter === 'all' || 
      (emp.employee?.costCenter && emp.employee.costCenter.toLowerCase().includes(costCenterFilter.toLowerCase()));
    
    const matchesClient = clientFilter === 'all' || 
      (emp.employee?.client && emp.employee.client.toLowerCase().includes(clientFilter.toLowerCase()));
    
    return isEmployee && matchesDepartment && matchesPosition && matchesCostCenter && matchesClient;
  });

  // Calcular informações de paginação
  const totalPages = Math.ceil(pagination.total / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, pagination.total);

  // Resetar página quando buscar
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  if (userRole !== 'ADMIN' && userRole !== 'HR') {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-3 bg-red-100 rounded-lg">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {userRole === 'ADMIN' ? 'Gerenciar Funcionários' : 'Lista de Funcionários'}
              </h3>
              <p className="text-sm text-gray-600">
                {userRole === 'ADMIN' 
                  ? 'Visualizar e gerenciar funcionários cadastrados' 
                  : 'Visualizar funcionários cadastrados'
                }
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Busca e Filtros */}
        <div className="mb-6 border border-gray-200 rounded-lg">
          {/* Cabeçalho dos Filtros */}
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              </div>
              <button
                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-md transition-colors"
              >
                <span>{isFilterExpanded ? 'Minimizar' : 'Expandir'}</span>
                {isFilterExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          
          {/* Conteúdo dos Filtros */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
            isFilterExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}>
            <div className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar funcionários por nome, email ou CPF..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center space-x-2 sm:w-48">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Status:</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
                    className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    <option value="active">Ativos</option>
                    <option value="inactive">Inativos</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
              </div>
              
              {/* Filtros adicionais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Setor:</label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    {departments.map((dept) => (
                      <option 
                        key={dept} 
                        value={dept === 'Todos' ? 'all' : dept}
                      >
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Cargo:</label>
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    {positions.map((pos) => (
                      <option 
                        key={pos} 
                        value={pos === 'Todos' ? 'all' : pos}
                      >
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Centro de Custo:</label>
                  <select
                    value={costCenterFilter}
                    onChange={(e) => setCostCenterFilter(e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    {costCenters.map((cc) => (
                      <option 
                        key={cc} 
                        value={cc === 'Todos' ? 'all' : cc}
                      >
                        {cc}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Tomador:</label>
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    {clients.map((client) => (
                      <option 
                        key={client} 
                        value={client === 'Todos' ? 'all' : client}
                      >
                        {client}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de funcionários */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
            <p className="text-gray-600">Carregando funcionários...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Nenhum funcionário encontrado</p>
          </div>
        ) : (
          <>
            {/* Informações de paginação */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
              <span>
                Mostrando {startItem} a {endItem} de {pagination.total} funcionários
              </span>
              <span>
                Página {currentPage} de {totalPages}
              </span>
            </div>

            <div className="space-y-4">
              {filteredEmployees.map((employee: Employee) => (
              <div
                key={employee.id}
                onClick={() => setSelectedEmployee(employee)}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{employee.name}</h4>
                      <p className="text-xs sm:text-sm text-gray-600">{employee.email}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
                        <span className="text-xs text-gray-500">CPF: {employee.cpf}</span>
                        {employee.employee && (
                          <>
                            <span className="text-xs text-gray-500">
                              Matrícula: {employee.employee.employeeId}
                            </span>
                            <span className="text-xs text-gray-500">
                              {employee.employee.department} - {employee.employee.position}
                            </span>
                            {employee.employee.costCenter && (
                              <span className="text-xs text-gray-500">
                                Centro: {employee.employee.costCenter}
                              </span>
                            )}
                            {employee.employee.client && (
                              <span className="text-xs text-gray-500">
                                Tomador: {employee.employee.client}
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              Admitido em: {formatDate(employee.employee.hireDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {showDeleteButton && (
                  <div className="flex items-center justify-end sm:justify-start space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(employee.id);
                      }}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Excluir funcionário"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            </div>

            {/* Botões de paginação */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                
                {/* Números das páginas */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNumber = i + 1;
                  const isActive = pageNumber === currentPage;
                  
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}

        {/* Modal de confirmação de exclusão */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Confirmar Exclusão</h3>
                    <p className="text-sm text-gray-600">Esta ação não pode ser desfeita</p>
                  </div>
                </div>
                
                <p className="text-gray-700 mb-6">
                  Tem certeza que deseja excluir este funcionário? O funcionário será desativado e não poderá mais acessar o sistema.
                </p>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    disabled={deleteEmployeeMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {deleteEmployeeMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Excluindo...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Excluir</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de detalhes do funcionário */}
        {selectedEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedEmployee(null)} />
            <div className="relative w-full max-w-6xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedEmployee.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedEmployee.employee?.position} - {selectedEmployee.employee?.department}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEmployee(null)}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                {/* Informações do funcionário */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Pessoais</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Nome:</span>
                        <span className="text-sm font-medium">{selectedEmployee.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Email:</span>
                        <span className="text-sm font-medium">{selectedEmployee.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">CPF:</span>
                        <span className="text-sm font-medium">{selectedEmployee.cpf}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Matrícula:</span>
                        <span className="text-sm font-medium">{selectedEmployee.employee?.employeeId}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Profissionais</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Setor:</span>
                        <span className="text-sm font-medium">{selectedEmployee.employee?.department}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Cargo:</span>
                        <span className="text-sm font-medium">{selectedEmployee.employee?.position}</span>
                      </div>
                      {selectedEmployee.employee?.modality && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Modalidade:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.modality}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Data de Admissão:</span>
                        <span className="text-sm font-medium">
                          {selectedEmployee.employee?.hireDate ? formatDate(selectedEmployee.employee.hireDate) : 'N/A'}
                        </span>
                      </div>
                      {selectedEmployee.employee?.costCenter && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Centro de Custo:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.costCenter}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.client && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Tomador:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.client}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Novos campos - Dados da Empresa e Contrato */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados da Empresa</h4>
                    <div className="space-y-2">
                      {selectedEmployee.employee?.company && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Empresa:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.company}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.currentContract && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Contrato Atual:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.currentContract}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Bancários</h4>
                    <div className="space-y-2">
                      {selectedEmployee.employee?.bank && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Banco:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.bank}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.accountType && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Tipo de Conta:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.accountType}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.agency && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Agência:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.agency}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.operation && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">OP:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.operation}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.account && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Conta:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.account}
                          </span>
                        </div>
                      )}
                      {selectedEmployee.employee?.digit && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Dígito:</span>
                          <span className="text-sm font-medium">
                            {selectedEmployee.employee.digit}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dados PIX */}
                {(selectedEmployee.employee?.pixKeyType || selectedEmployee.employee?.pixKey) && (
                  <div className="mb-6">
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados PIX</h4>
                      <div className="space-y-2">
                        {selectedEmployee.employee?.pixKeyType && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Tipo de Chave:</span>
                            <span className="text-sm font-medium">
                              {selectedEmployee.employee.pixKeyType}
                            </span>
                          </div>
                        )}
                        {selectedEmployee.employee?.pixKey && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Chave PIX:</span>
                            <span className="text-sm font-medium">
                              {selectedEmployee.employee.pixKey}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                

                {/* Seção de Acréscimos Salariais */}
                <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-md font-semibold text-gray-900">
                        Acréscimos
                        {adjustments.length > 0 && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            {adjustments.length}
                          </span>
                        )}
                      </h4>
                      <button
                        onClick={() => setIsAdjustmentsMinimized(!isAdjustmentsMinimized)}
                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                        title={isAdjustmentsMinimized ? "Expandir seção" : "Minimizar seção"}
                      >
                        {isAdjustmentsMinimized ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowAddAdjustmentForm(true);
                        setIsAdjustmentsMinimized(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar Acréscimo</span>
                    </button>
                  </div>
                  
                  {/* Conteúdo da seção - só exibe se não estiver minimizada */}
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    isAdjustmentsMinimized ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'
                  }`}>
                    <div className="space-y-4">
                      {/* Formulário para adicionar acréscimo */}
                      {showAddAdjustmentForm && selectedEmployee.employee && (
                        <AdjustmentForm 
                          employeeId={selectedEmployee.employee.id}
                          onSave={handleAddAdjustment}
                          onCancel={() => setShowAddAdjustmentForm(false)}
                        />
                      )}
                      
                      {/* Formulário de edição */}
                      {editingAdjustment && selectedEmployee.employee && (
                        <AdjustmentForm 
                          employeeId={selectedEmployee.employee.id}
                          adjustment={editingAdjustment}
                          onSave={handleUpdateAdjustment}
                          onCancel={() => setEditingAdjustment(null)}
                        />
                      )}
                      
                      {/* Lista de acréscimos existentes */}
                      <AdjustmentsList 
                        adjustments={adjustments}
                        onEdit={handleEditAdjustment}
                        onDelete={handleDeleteAdjustment}
                      />
                    </div>
                  </div>
                </div>

                {/* Seção de Descontos Salariais */}
                <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-md font-semibold text-gray-900">
                        Descontos
                        {discounts.length > 0 && (
                          <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                            {discounts.length}
                          </span>
                        )}
                      </h4>
                      <button
                        onClick={() => setIsDiscountsMinimized(!isDiscountsMinimized)}
                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                        title={isDiscountsMinimized ? "Expandir seção" : "Minimizar seção"}
                      >
                        {isDiscountsMinimized ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowAddDiscountForm(true);
                        setIsDiscountsMinimized(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar Desconto</span>
                    </button>
                  </div>
                  
                  {/* Conteúdo da seção - só exibe se não estiver minimizada */}
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    isDiscountsMinimized ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'
                  }`}>
                    <div className="space-y-4">
                      {/* Formulário para adicionar desconto */}
                      {showAddDiscountForm && selectedEmployee.employee && (
                        <DiscountForm 
                          employeeId={selectedEmployee.employee.id}
                          onSave={handleAddDiscount}
                          onCancel={() => setShowAddDiscountForm(false)}
                        />
                      )}
                      
                      {/* Formulário de edição */}
                      {editingDiscount && selectedEmployee.employee && (
                        <DiscountForm 
                          employeeId={selectedEmployee.employee.id}
                          discount={editingDiscount}
                          onSave={handleUpdateDiscount}
                          onCancel={() => setEditingDiscount(null)}
                        />
                      )}
                      
                      {/* Lista de descontos existentes */}
                      <DiscountsList 
                        discounts={discounts}
                        onEdit={handleEditDiscount}
                        onDelete={handleDeleteDiscount}
                      />
                    </div>
                  </div>
                </div>

                {/* Seletor de mês/ano */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-semibold text-gray-900">Registros de Ponto</h4>
                    {employeeRecordsData?.data && employeeRecordsData.data.length > 0 && (
                      <button
                        onClick={exportToExcel}
                        className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Exportar XLSX</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={1}>Janeiro</option>
                        <option value={2}>Fevereiro</option>
                        <option value={3}>Março</option>
                        <option value={4}>Abril</option>
                        <option value={5}>Maio</option>
                        <option value={6}>Junho</option>
                        <option value={7}>Julho</option>
                        <option value={8}>Agosto</option>
                        <option value={9}>Setembro</option>
                        <option value={10}>Outubro</option>
                        <option value={11}>Novembro</option>
                        <option value={12}>Dezembro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {Array.from({ length: 5 }, (_, i) => {
                          const year = new Date().getFullYear() - 2 + i;
                          return (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Lista de registros */}
                {loadingRecords ? (
                  <div className="text-center py-8">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                    <p className="text-gray-600">Carregando registros...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900">
                      Registros de {selectedMonth.toString().padStart(2, '0')}/{selectedYear}
                    </h4>
                    
                    {employeeRecordsData?.data?.length === 0 ? (
                      <div className="text-center py-8">
                        <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Nenhum registro encontrado para este período</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(groupRecordsByDay(employeeRecordsData?.data || []))
                          .sort(([a], [b]) => new Date(a.split('/').reverse().join('-')).getTime() - new Date(b.split('/').reverse().join('-')).getTime())
                          .map(([date, records]: [string, any[]]) => (
                          <div key={date} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <span className="font-semibold text-gray-900">{date}</span>
                              </div>
                              <span className="text-sm text-gray-600">
                                {records.length} registro{records.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                              {records.map((record: any, index: number) => (
                                <div key={index} className="px-3 py-2 bg-white rounded-md border">
                                  <div className="flex items-center space-x-2">
                                    <Clock className="w-3 h-3 text-gray-500" />
                                    {record.type !== 'ABSENCE_JUSTIFIED' && (
                                      <span className="text-sm font-medium text-gray-900">
                                        {(() => {
                                          const date = new Date(record.timestamp);
                                          const hours = date.getUTCHours().toString().padStart(2, '0');
                                          const minutes = date.getUTCMinutes().toString().padStart(2, '0');
                                          const seconds = date.getUTCSeconds().toString().padStart(2, '0');
                                          return `${hours}:${minutes}:${seconds}`;
                                        })()}
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-600">
                                      {record.type === 'ENTRY' ? 'Entrada' :
                                       record.type === 'EXIT' ? 'Saída' :
                                       record.type === 'LUNCH_START' ? 'Almoço' :
                                       record.type === 'LUNCH_END' ? 'Retorno' :
                                       record.type === 'BREAK_START' ? 'Início Pausa' :
                                       record.type === 'BREAK_END' ? 'Fim Pausa' :
                                       record.type === 'ABSENCE_JUSTIFIED' ? 'Ausência Justificada' : record.type}
                                    </span>
                                    {userRole === 'ADMIN' && (
                                      <>
                                        {record.type === 'ABSENCE_JUSTIFIED' && record.medicalCertificateDetails && (
                                          <button
                                            onClick={() => setViewingCertificate(viewingCertificate === `${date}-${index}` ? null : `${date}-${index}`)}
                                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                            title="Ver detalhes do atestado"
                                          >
                                            <Eye className="w-3 h-3" />
                                          </button>
                                        )}
                                        {record.photoUrl && (
                                          <button
                                            onClick={() => window.open(record.photoUrl, '_blank')}
                                            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                                            title="Ver foto"
                                          >
                                            <Camera className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleEditRecord(record)}
                                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                          title="Editar registro"
                                        >
                                          <Edit className="w-3 h-3" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  
                                  {/* Detalhes do atestado médico para ausência justificada */}
                                  {record.type === 'ABSENCE_JUSTIFIED' && record.medicalCertificateDetails && viewingCertificate === `${date}-${index}` && (
                                    <div className="mt-2 p-2">
                                      <div className="flex items-center space-x-2 mb-1">
                                        <FileCheck className="w-3 h-3 text-600" />
                                        <span className="text-xs font-medium text-800">Detalhes do Atestado</span>
                                      </div>
                                      <div className="space-y-1 text-xs text-gray-700">
                                        <div className="flex items-center space-x-2">
                                          <Calendar className="w-3 h-3" />
                                          <span>
                                            {new Date(record.medicalCertificateDetails.startDate).toLocaleDateString('pt-BR')} - {new Date(record.medicalCertificateDetails.endDate).toLocaleDateString('pt-BR')}
                                          </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <Clock className="w-3 h-3" />
                                          <span>{record.medicalCertificateDetails.days} dias</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <User className="w-3 h-3" />
                                          <span>Enviado em {new Date(record.medicalCertificateDetails.submittedAt).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        {record.medicalCertificateDetails.description && (
                                          <div className="text-xs text-600 mt-1">
                                            <strong>Obs:</strong> {record.medicalCertificateDetails.description}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {record.observation && (
                                    <div className="mt-1 text-xs text-gray-500 italic">
                                      <strong>Obs:</strong> {record.observation}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            
                            {/* Mostrar motivo de alterações apenas se houver */}
                            {records.some((record: any) => record.reason && !record.reason.includes('Localização registrada')) && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="text-sm text-gray-600">
                                  <strong>Motivo de Alterações:</strong>
                                  <ul className="mt-1 space-y-1">
                                    {records
                                      .filter((record: any) => record.reason && !record.reason.includes('Localização registrada'))
                                      .map((record: any, index: number) => (
                                        <li key={index} className="flex items-start space-x-2">
                                          <span className="text-gray-500">•</span>
                                          <span>{record.reason}</span>
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de edição de registro */}
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={handleCancelEdit} />
            <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Editar Registro</h3>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Registro
                  </label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ENTRY">Entrada</option>
                    <option value="LUNCH_START">Almoço</option>
                    <option value="LUNCH_END">Retorno</option>
                    <option value="EXIT">Saída</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data e Hora
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.timestamp}
                    onChange={(e) => setEditForm({ ...editForm, timestamp: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observação do Funcionário
                  </label>
                  <textarea
                    value={editForm.observation}
                    onChange={(e) => setEditForm({ ...editForm, observation: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Observação do funcionário..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo da Alteração
                  </label>
                  <textarea
                    value={editForm.reason}
                    onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Motivo da alteração..."
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={handleSaveEdit}
                    disabled={updateRecordMutation.isPending}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span>{updateRecordMutation.isPending ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
