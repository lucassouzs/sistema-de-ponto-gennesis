'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Download,
  Edit,
  FileText,
  History,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SpreadsheetImportModal } from '@/components/ui/SpreadsheetImportModal';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { CARGOS_AVAILABLE } from '@/constants/cargos';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { exportAsoRegistrosToExcel } from '@/lib/asoExport';
import {
  ASO_IMPORT_COLUMNS,
  downloadAsoImportTemplate,
  parseAsosFromFile,
} from '@/lib/asoImport';
import api from '@/lib/api';

type AsoResultado = 'APTO' | 'APTO_COM_RESTRICAO' | 'INAPTO';
type AsoGrauRisco = 'BAIXO' | 'MEDIO' | 'ALTO';
type TabKey = 'registros' | 'por-funcionario' | 'cargos';
type StatusValidadeFilter =
  | ''
  | 'validos'
  | 'a_vencer_30'
  | 'a_vencer_60'
  | 'vencidos'
  | 'validade_padrao';

type AsoTipo = { id: string; nome: string };

type CargoRisco = {
  id: string;
  cargo: string;
  grauRisco: AsoGrauRisco;
  periodicidadeMeses: number;
};

type FuncionarioResumo = {
  id: string;
  employeeId: string;
  position: string;
  department: string;
  user?: { name: string; cpf: string; isActive: boolean; email?: string };
};

type AsoRegistro = {
  id: string;
  funcionarioId: string;
  tipoAsoId: string;
  dataExame: string;
  dataValidade: string;
  resultado: AsoResultado;
  medicoResponsavel: string;
  crmMedico: string;
  clinica: string;
  anexoUrl?: string | null;
  observacoes?: string | null;
  validadePadrao: boolean;
  periodicidadeUsada: number;
  tipoAso?: AsoTipo;
  funcionario?: FuncionarioResumo;
};

type EmployeeOption = {
  id: string;
  name: string;
  position: string;
  department: string;
  employeeId: string;
};

type DashboardData = {
  total: number;
  vencidos: number;
  aVencer30: number;
  aVencer60: number;
  validadePadrao: number;
  cobertura: { ativos: number; comAsoValido: number; percentual: number };
  cargosSemPeriodicidade: number;
};

type PorFuncionarioStatus = 'validos' | 'a_vencer_30' | 'a_vencer_60' | 'vencidos' | 'sem_aso';

type PorFuncionarioItem = {
  funcionarioId: string;
  employeeId: string;
  nome: string;
  cpf: string;
  position: string;
  department: string;
  ultimoAso: {
    id: string;
    tipoAsoId: string;
    tipoAso?: AsoTipo;
    dataExame: string;
    dataValidade: string;
  } | null;
  statusValidade: PorFuncionarioStatus;
  hasPeriodicidadeCargo: boolean;
};

type CargoSemPeriodicidadeItem = {
  cargo: string;
  funcionarios: Array<{ id: string; nome: string; employeeId: string; department: string }>;
};

type UltimoAsoFuncionario = {
  tipoAsoId: string;
  medicoResponsavel: string;
  crmMedico: string;
  clinica: string;
  dataExame: string;
  dataValidade: string;
} | null;

type FormState = {
  funcionarioId: string;
  tipoAsoId: string;
  dataExame: string;
  resultado: AsoResultado | '';
  medicoResponsavel: string;
  crmMedico: string;
  clinica: string;
  observacoes: string;
};

const EMPTY_FORM: FormState = {
  funcionarioId: '',
  tipoAsoId: '',
  dataExame: '',
  resultado: '',
  medicoResponsavel: '',
  crmMedico: '',
  clinica: '',
  observacoes: '',
};

const RESULTADO_LABEL: Record<AsoResultado, string> = {
  APTO: 'Apto',
  APTO_COM_RESTRICAO: 'Apto com restrição',
  INAPTO: 'Inapto',
};

const GRAU_LABEL: Record<AsoGrauRisco, string> = {
  BAIXO: 'Baixo',
  MEDIO: 'Médio',
  ALTO: 'Alto',
};

const BADGE_TONE = {
  vencido: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  a_vencer: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  valido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  neutro: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
} as const;

function formatDateBr(value?: string | null) {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

function todayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

/** Classifica a validade de uma data (mesmas faixas usadas no backend: 30/60 dias). */
function classifyValidade(dataValidade: string): 'vencido' | 'a_vencer_30' | 'a_vencer_60' | 'valido' {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const parts = String(dataValidade).slice(0, 10).split('-').map(Number);
  const validadeUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const in30 = todayUtc + 30 * 24 * 60 * 60 * 1000;
  const in60 = todayUtc + 60 * 24 * 60 * 60 * 1000;
  if (validadeUtc < todayUtc) return 'vencido';
  if (validadeUtc <= in30) return 'a_vencer_30';
  if (validadeUtc <= in60) return 'a_vencer_60';
  return 'valido';
}

function RowStatusBadge({ dataValidade }: { dataValidade: string }) {
  const classe = classifyValidade(dataValidade);
  const label = classe === 'vencido' ? 'Vencido' : classe === 'valido' ? 'Válido' : 'A vencer';
  const tone = classe === 'vencido' ? BADGE_TONE.vencido : classe === 'valido' ? BADGE_TONE.valido : BADGE_TONE.a_vencer;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {formatDateBr(dataValidade)} · {label}
    </span>
  );
}

const PF_STATUS_LABEL: Record<PorFuncionarioStatus, { label: string; tone: string }> = {
  vencidos: { label: 'Vencido', tone: BADGE_TONE.vencido },
  a_vencer_30: { label: 'A vencer (30d)', tone: BADGE_TONE.a_vencer },
  a_vencer_60: { label: 'A vencer (60d)', tone: BADGE_TONE.a_vencer },
  validos: { label: 'Válido', tone: BADGE_TONE.valido },
  sem_aso: { label: 'Sem ASO', tone: BADGE_TONE.neutro },
};

function showApiWarning(warning?: string) {
  if (!warning) return;
  toast(warning, { icon: '⚠️', duration: 7000 });
}

export default function SegurancaDoTrabalhoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('registros');

  // Filtros — Registros
  const [search, setSearch] = useState('');
  const [statusValidade, setStatusValidade] = useState<StatusValidadeFilter>('');
  const [filterTipoId, setFilterTipoId] = useState('');
  const [filterResultado, setFilterResultado] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Filtros — Por funcionário
  const [pfSearch, setPfSearch] = useState('');
  const [pfDepartment, setPfDepartment] = useState('');
  const [pfPosition, setPfPosition] = useState('');

  // Form ASO (novo/editar/renovar)
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AsoRegistro | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Anexo rápido (a partir da lista, sem abrir o formulário)
  const [pendingAnexoRowId, setPendingAnexoRowId] = useState<string | null>(null);
  const anexoInputRef = useRef<HTMLInputElement>(null);

  // Histórico (timeline) por funcionário
  const [historicoFuncionarioId, setHistoricoFuncionarioId] = useState<string | null>(null);

  // Cargos e risco
  const [cargoForm, setCargoForm] = useState({
    cargo: '',
    grauRisco: 'MEDIO' as AsoGrauRisco,
    periodicidadeMeses: '12',
  });
  const [editingCargo, setEditingCargo] = useState<CargoRisco | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: tipos = [] } = useQuery<AsoTipo[]>({
    queryKey: ['aso-tipos'],
    queryFn: async () => (await api.get('/aso/tipos')).data?.data || [],
  });

  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ['aso-dashboard'],
    queryFn: async () => (await api.get('/aso/dashboard')).data?.data,
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['aso-employee-options'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { page: 1, limit: 1000 } });
      const users = res.data?.data || [];
      return users
        .filter((u: any) => u.employee?.id)
        .map((u: any) => ({
          id: String(u.employee.id),
          name: String(u.name || '').trim(),
          position: String(u.employee.position || '').trim(),
          department: String(u.employee.department || '').trim(),
          employeeId: String(u.employee.employeeId || '').trim(),
        }))
        .filter((e: EmployeeOption) => e.id && e.name)
        .sort((a: EmployeeOption, b: EmployeeOption) => a.name.localeCompare(b.name, 'pt-BR'));
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: [
      'aso-registros',
      search,
      statusValidade,
      filterTipoId,
      filterResultado,
      filterDepartment,
      filterPosition,
      page,
    ],
    queryFn: async () => {
      const res = await api.get('/aso/registros', {
        params: {
          search: search || undefined,
          statusValidade: statusValidade || undefined,
          tipoAsoId: filterTipoId || undefined,
          resultado: filterResultado || undefined,
          department: filterDepartment || undefined,
          position: filterPosition || undefined,
          page,
          limit: 20,
        },
      });
      return res.data?.data;
    },
    enabled: tab === 'registros',
  });

  const { data: porFuncionario = [], isLoading: loadingPorFuncionario } = useQuery<
    PorFuncionarioItem[]
  >({
    queryKey: ['aso-por-funcionario', pfSearch, pfDepartment, pfPosition],
    queryFn: async () => {
      const res = await api.get('/aso/por-funcionario', {
        params: {
          search: pfSearch || undefined,
          department: pfDepartment || undefined,
          position: pfPosition || undefined,
        },
      });
      return res.data?.data || [];
    },
    enabled: tab === 'por-funcionario',
  });

  const { data: cargos = [], isLoading: loadingCargos } = useQuery<CargoRisco[]>({
    queryKey: ['aso-cargos-risco'],
    queryFn: async () => (await api.get('/aso/cargos-risco')).data?.data || [],
    enabled: tab === 'cargos',
  });

  const { data: cargosDisponiveis = [], isLoading: loadingCargosDisponiveis } = useQuery<
    Array<{ cargo: string; jaCadastrado: boolean }>
  >({
    queryKey: ['aso-cargos-disponiveis'],
    queryFn: async () => (await api.get('/aso/cargos-disponiveis')).data?.data || [],
    enabled: tab === 'cargos',
  });

  const { data: cargosSemPeriodicidade = [], isLoading: loadingCargosSemPeriodicidade } = useQuery<
    CargoSemPeriodicidadeItem[]
  >({
    queryKey: ['aso-cargos-sem-periodicidade'],
    queryFn: async () => (await api.get('/aso/cargos-sem-periodicidade')).data?.data || [],
    enabled: tab === 'cargos',
  });

  /** Mesma lista do campo Cargo do cadastro de funcionários. */
  const cargoSelectOptions = useMemo(() => {
    const byNorm = new Map(
      cargosDisponiveis.map((item) => [item.cargo.trim().toLowerCase(), item] as const)
    );
    const editingCargoNorm = editingCargo?.cargo.trim().toLowerCase() || '';

    const fromApi = cargosDisponiveis.map((item) => {
      const isCurrentEdit =
        Boolean(editingCargoNorm) && item.cargo.trim().toLowerCase() === editingCargoNorm;
      const disabled = item.jaCadastrado && !isCurrentEdit;
      return {
        value: item.cargo,
        label: disabled ? `${item.cargo} (já cadastrado)` : item.cargo,
        searchText: item.cargo,
        disabled,
      };
    });

    const fromCadastroFallback = CARGOS_AVAILABLE.filter(
      (cargo) => cargo !== 'Diretor' && !byNorm.has(cargo.trim().toLowerCase())
    ).map((cargo) => ({
      value: cargo,
      label: cargo,
      searchText: cargo,
      disabled: false,
    }));

    const merged = [...fromApi, ...fromCadastroFallback].sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR')
    );

    if (
      editingCargo &&
      !merged.some((o) => o.value.trim().toLowerCase() === editingCargo.cargo.trim().toLowerCase())
    ) {
      merged.unshift({
        value: editingCargo.cargo,
        label: editingCargo.cargo,
        searchText: editingCargo.cargo,
        disabled: false,
      });
    }

    return merged;
  }, [cargosDisponiveis, editingCargo]);

  const { data: preview } = useQuery({
    queryKey: ['aso-preview-validade', form.funcionarioId, form.dataExame],
    queryFn: async () => {
      const res = await api.get('/aso/preview-validade', {
        params: { funcionarioId: form.funcionarioId, dataExame: form.dataExame },
      });
      return res.data?.data as {
        dataValidade: string;
        periodicidadeMeses: number;
        validadePadrao: boolean;
        cargo: string;
      };
    },
    enabled: showForm && Boolean(form.funcionarioId && form.dataExame),
  });

  const { data: ultimoAso } = useQuery<UltimoAsoFuncionario>({
    queryKey: ['aso-ultimo-funcionario', form.funcionarioId],
    queryFn: async () =>
      (await api.get(`/aso/funcionarios/${form.funcionarioId}/ultimo`)).data?.data ?? null,
    enabled: showForm && !editing && Boolean(form.funcionarioId),
  });

  useEffect(() => {
    if (!ultimoAso) return;
    setForm((f) => {
      if (f.medicoResponsavel.trim() || f.crmMedico.trim() || f.clinica.trim()) return f;
      return {
        ...f,
        tipoAsoId: f.tipoAsoId || ultimoAso.tipoAsoId || '',
        medicoResponsavel: ultimoAso.medicoResponsavel || '',
        crmMedico: ultimoAso.crmMedico || '',
        clinica: ultimoAso.clinica || '',
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoAso]);

  const { data: historicoData, isLoading: loadingHistorico } = useQuery({
    queryKey: ['aso-historico', historicoFuncionarioId],
    queryFn: async () =>
      (await api.get(`/aso/funcionarios/${historicoFuncionarioId}/historico`)).data?.data as {
        funcionario: FuncionarioResumo & { employeeId: string };
        registros: AsoRegistro[];
      },
    enabled: Boolean(historicoFuncionarioId),
  });

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: e.name,
        searchText: `${e.name} ${e.employeeId} ${e.position} ${e.department}`,
      })),
    [employees]
  );

  const departmentFilterOptions = useMemo(() => {
    const set = new Set(employees.map((e) => e.department).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((d) => ({ value: d, label: d }));
  }, [employees]);

  const positionFilterOptions = useMemo(() => {
    const set = new Set(employees.map((e) => e.position).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((p) => ({ value: p, label: p }));
  }, [employees]);

  const tipoOptions = useMemo(() => tipos.map((t) => ({ value: t.id, label: t.nome })), [tipos]);

  const resultadoOptions = useMemo(
    () =>
      (Object.keys(RESULTADO_LABEL) as AsoResultado[]).map((value) => ({
        value,
        label: RESULTADO_LABEL[value],
      })),
    []
  );

  const statusOptions = useMemo(
    () => [
      { value: '', label: 'Todas as validades' },
      { value: 'validos', label: 'Válidos' },
      { value: 'a_vencer_30', label: 'A vencer (30 dias)' },
      { value: 'a_vencer_60', label: 'A vencer (60 dias)' },
      { value: 'vencidos', label: 'Vencidos' },
      { value: 'validade_padrao', label: 'Validade padrão' },
    ],
    []
  );

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (search.trim()) {
      chips.push({ key: 'search', label: `Busca: "${search.trim()}"`, onClear: () => setSearch('') });
    }
    if (statusValidade) {
      const opt = statusOptions.find((o) => o.value === statusValidade);
      chips.push({
        key: 'statusValidade',
        label: `Validade: ${opt?.label || statusValidade}`,
        onClear: () => setStatusValidade(''),
      });
    }
    if (filterTipoId) {
      const opt = tipoOptions.find((o) => o.value === filterTipoId);
      chips.push({
        key: 'tipo',
        label: `Tipo: ${opt?.label || filterTipoId}`,
        onClear: () => setFilterTipoId(''),
      });
    }
    if (filterResultado) {
      chips.push({
        key: 'resultado',
        label: `Resultado: ${RESULTADO_LABEL[filterResultado as AsoResultado] || filterResultado}`,
        onClear: () => setFilterResultado(''),
      });
    }
    if (filterDepartment) {
      chips.push({
        key: 'setor',
        label: `Setor: ${filterDepartment}`,
        onClear: () => setFilterDepartment(''),
      });
    }
    if (filterPosition) {
      chips.push({
        key: 'cargo',
        label: `Cargo: ${filterPosition}`,
        onClear: () => setFilterPosition(''),
      });
    }
    return chips;
  }, [search, statusValidade, filterTipoId, filterResultado, filterDepartment, filterPosition, statusOptions, tipoOptions]);

  const clearAllFilters = () => {
    setSearch('');
    setStatusValidade('');
    setFilterTipoId('');
    setFilterResultado('');
    setFilterDepartment('');
    setFilterPosition('');
  };

  const resetFormState = () => {
    setForm(EMPTY_FORM);
    setAnexoFile(null);
  };

  const openCreate = () => {
    setEditing(null);
    resetFormState();
    setShowForm(true);
  };

  const openCreateForFuncionario = (funcionarioId: string) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, funcionarioId });
    setAnexoFile(null);
    setShowForm(true);
  };

  const openEdit = (row: AsoRegistro) => {
    setEditing(row);
    setForm({
      funcionarioId: row.funcionarioId,
      tipoAsoId: row.tipoAsoId,
      dataExame: String(row.dataExame).slice(0, 10),
      resultado: row.resultado,
      medicoResponsavel: row.medicoResponsavel,
      crmMedico: row.crmMedico,
      clinica: row.clinica,
      observacoes: row.observacoes || '',
    });
    setAnexoFile(null);
    setShowForm(true);
  };

  const openRenovar = (row: {
    funcionarioId: string;
    tipoAsoId: string;
    medicoResponsavel: string;
    crmMedico: string;
    clinica: string;
  }) => {
    setEditing(null);
    setForm({
      funcionarioId: row.funcionarioId,
      tipoAsoId: row.tipoAsoId,
      dataExame: todayIso(),
      resultado: '',
      medicoResponsavel: row.medicoResponsavel,
      crmMedico: row.crmMedico,
      clinica: row.clinica,
      observacoes: '',
    });
    setAnexoFile(null);
    setShowForm(true);
  };

  const handleRenovarFuncionario = async (funcionarioId: string) => {
    try {
      const res = await api.get(`/aso/funcionarios/${funcionarioId}/ultimo`);
      const ultimo = res.data?.data as UltimoAsoFuncionario;
      if (!ultimo) {
        openCreateForFuncionario(funcionarioId);
        return;
      }
      openRenovar({
        funcionarioId,
        tipoAsoId: ultimo.tipoAsoId,
        medicoResponsavel: ultimo.medicoResponsavel,
        crmMedico: ultimo.crmMedico,
        clinica: ultimo.clinica,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível carregar o último ASO');
    }
  };

  const applyDashboardFilter = (next: StatusValidadeFilter) => {
    setTab('registros');
    setStatusValidade(next);
    setPage(1);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.funcionarioId || !form.tipoAsoId || !form.dataExame || !form.resultado) {
        throw new Error('Preencha funcionário, tipo, data e resultado');
      }
      const payload = {
        funcionarioId: form.funcionarioId,
        tipoAsoId: form.tipoAsoId,
        dataExame: form.dataExame,
        resultado: form.resultado,
        medicoResponsavel: form.medicoResponsavel,
        crmMedico: form.crmMedico,
        clinica: form.clinica,
        observacoes: form.observacoes || null,
      };

      let result: any;
      let registroId: string | undefined;
      if (editing) {
        result = (await api.put(`/aso/registros/${editing.id}`, payload)).data;
        registroId = editing.id;
      } else {
        result = (await api.post('/aso/registros', payload)).data;
        registroId = result?.data?.id;
      }

      if (anexoFile && registroId) {
        const fd = new FormData();
        fd.append('file', anexoFile);
        await api.post(`/aso/registros/${registroId}/anexo`, fd);
      }

      return result;
    },
    onSuccess: (res) => {
      showApiWarning(res?.warning);
      toast.success(res?.message || 'ASO salvo');
      setShowForm(false);
      resetFormState();
      queryClient.invalidateQueries({ queryKey: ['aso-registros'] });
      queryClient.invalidateQueries({ queryKey: ['aso-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['aso-por-funcionario'] });
      queryClient.invalidateQueries({ queryKey: ['aso-historico'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao salvar ASO');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/aso/registros/${id}`)).data,
    onSuccess: () => {
      toast.success('ASO removido');
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['aso-registros'] });
      queryClient.invalidateQueries({ queryKey: ['aso-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['aso-por-funcionario'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao remover');
    },
  });

  const anexoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post(`/aso/registros/${id}/anexo`, fd)).data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Anexo enviado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['aso-registros'] });
      queryClient.invalidateQueries({ queryKey: ['aso-historico'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao enviar anexo');
    },
  });

  const saveCargoMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        cargo: cargoForm.cargo.trim(),
        grauRisco: cargoForm.grauRisco,
        periodicidadeMeses: Number(cargoForm.periodicidadeMeses),
      };
      if (editingCargo) {
        return (await api.put(`/aso/cargos-risco/${editingCargo.id}`, payload)).data;
      }
      return (await api.post('/aso/cargos-risco', payload)).data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Cargo salvo');
      setEditingCargo(null);
      setCargoForm({ cargo: '', grauRisco: 'MEDIO', periodicidadeMeses: '12' });
      queryClient.invalidateQueries({ queryKey: ['aso-cargos-risco'] });
      queryClient.invalidateQueries({ queryKey: ['aso-cargos-disponiveis'] });
      queryClient.invalidateQueries({ queryKey: ['aso-cargos-sem-periodicidade'] });
      queryClient.invalidateQueries({ queryKey: ['aso-dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar cargo');
    },
  });

  const deleteCargoMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/aso/cargos-risco/${id}`)).data,
    onSuccess: () => {
      toast.success('Cargo removido');
      queryClient.invalidateQueries({ queryKey: ['aso-cargos-risco'] });
      queryClient.invalidateQueries({ queryKey: ['aso-cargos-disponiveis'] });
      queryClient.invalidateQueries({ queryKey: ['aso-cargos-sem-periodicidade'] });
      queryClient.invalidateQueries({ queryKey: ['aso-dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao remover cargo');
    },
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusValidade, filterTipoId, filterResultado, filterDepartment, filterPosition]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/aso/export', {
        params: {
          search: search || undefined,
          statusValidade: statusValidade || undefined,
          tipoAsoId: filterTipoId || undefined,
          resultado: filterResultado || undefined,
          department: filterDepartment || undefined,
          position: filterPosition || undefined,
        },
      });
      const rows: AsoRegistro[] = res.data?.data || [];
      if (!rows.length) {
        toast('Nenhum registro para exportar com os filtros atuais', { icon: 'ℹ️' });
        return;
      }
      exportAsoRegistrosToExcel(rows);
      toast.success(`Exportado ${rows.length} registro${rows.length === 1 ? '' : 's'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao exportar');
    } finally {
      setExporting(false);
    }
  };

  const triggerAnexoUpload = (id: string) => {
    setPendingAnexoRowId(id);
    anexoInputRef.current?.click();
  };

  const handleAnexoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && pendingAnexoRowId) {
      anexoMutation.mutate({ id: pendingAnexoRowId, file });
    }
    e.target.value = '';
    setPendingAnexoRowId(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const registros: AsoRegistro[] = listData?.items || [];
  const pagination = listData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  return (
    <ProtectedRoute route="/ponto/seguranca-do-trabalho">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <input
          ref={anexoInputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={handleAnexoInputChange}
        />

        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Segurança do Trabalho
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Controle de ASO (Atestado de Saúde Ocupacional) dos funcionários
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                {
                  label: 'Total',
                  value: dashboard?.total ?? '—',
                  sub: undefined,
                  onClick: () => applyDashboardFilter(''),
                  tone: undefined,
                },
                {
                  label: 'A vencer 30d',
                  value: dashboard?.aVencer30 ?? '—',
                  sub: undefined,
                  onClick: () => applyDashboardFilter('a_vencer_30'),
                  tone: 'text-amber-600 dark:text-amber-400',
                },
                {
                  label: 'A vencer 60d',
                  value: dashboard?.aVencer60 ?? '—',
                  sub: undefined,
                  onClick: () => applyDashboardFilter('a_vencer_60'),
                  tone: 'text-amber-600 dark:text-amber-400',
                },
                {
                  label: 'Vencidos',
                  value: dashboard?.vencidos ?? '—',
                  sub: undefined,
                  onClick: () => applyDashboardFilter('vencidos'),
                  tone: 'text-red-600 dark:text-red-400',
                },
                {
                  label: 'Validade padrão',
                  value: dashboard?.validadePadrao ?? '—',
                  sub: undefined,
                  onClick: () => applyDashboardFilter('validade_padrao'),
                  tone: undefined,
                },
                {
                  label: 'Cobertura (ativos)',
                  value: dashboard?.cobertura != null ? `${dashboard.cobertura.percentual}%` : '—',
                  sub:
                    dashboard?.cobertura != null
                      ? `${dashboard.cobertura.comAsoValido}/${dashboard.cobertura.ativos} com ASO válido`
                      : undefined,
                  onClick: () => setTab('por-funcionario'),
                  tone: 'text-emerald-600 dark:text-emerald-400',
                },
              ] as Array<{
                label: string;
                value: string | number;
                sub?: string;
                onClick: () => void;
                tone?: string;
              }>
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-red-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:hover:border-red-800"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                <p
                  className={`mt-1 text-xl font-semibold ${
                    item.tone || 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {item.value}
                </p>
                {item.sub ? (
                  <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{item.sub}</p>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('registros')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                tab === 'registros'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              Registros ASO
            </button>
            <button
              type="button"
              onClick={() => setTab('por-funcionario')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                tab === 'por-funcionario'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              Por funcionário
            </button>
            <button
              type="button"
              onClick={() => setTab('cargos')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                tab === 'cargos'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              Cargos e risco
            </button>
          </div>

          {tab === 'registros' ? (
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <div className={cadastroListClasses.cardHeaderRow}>
                  <div className={cadastroListClasses.cardHeaderIconRow}>
                    <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                      <Shield className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                        ASOs
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {pagination.total} registro{pagination.total === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className={cadastroListClasses.cardToolbar}>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Upload className="h-4 w-4" />
                      Importar
                    </button>
                    <button
                      type="button"
                      onClick={handleExport}
                      disabled={exporting}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Download className="h-4 w-4" />
                      {exporting ? 'Exportando...' : 'Exportar'}
                    </button>
                    <button
                      type="button"
                      onClick={openCreate}
                      className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      <Plus className="h-4 w-4" />
                      Novo ASO
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar funcionário, clínica..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <SingleSelectSearchDropdown
                    value={statusValidade}
                    onChange={(v) => setStatusValidade(v as StatusValidadeFilter)}
                    options={statusOptions}
                    placeholder="Validade"
                    noFocusRing
                  />
                  <SingleSelectSearchDropdown
                    value={filterTipoId}
                    onChange={setFilterTipoId}
                    options={[{ value: '', label: 'Todos os tipos' }, ...tipoOptions]}
                    placeholder="Tipo de ASO"
                    noFocusRing
                  />
                  <SingleSelectSearchDropdown
                    value={filterResultado}
                    onChange={setFilterResultado}
                    options={[{ value: '', label: 'Todos os resultados' }, ...resultadoOptions]}
                    placeholder="Resultado"
                    noFocusRing
                  />
                  <SingleSelectSearchDropdown
                    value={filterDepartment}
                    onChange={setFilterDepartment}
                    options={[{ value: '', label: 'Todos os setores' }, ...departmentFilterOptions]}
                    placeholder="Setor"
                    noFocusRing
                  />
                </div>
                <div className="mt-2 grid gap-2 sm:w-56">
                  <SingleSelectSearchDropdown
                    value={filterPosition}
                    onChange={setFilterPosition}
                    options={[{ value: '', label: 'Todos os cargos' }, ...positionFilterOptions]}
                    placeholder="Cargo"
                    noFocusRing
                  />
                </div>
                {activeFilterChips.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {activeFilterChips.map((chip) => (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      >
                        {chip.label}
                        <button
                          type="button"
                          onClick={chip.onClear}
                          className="rounded-full p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50"
                          title="Remover filtro"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-xs font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
                    >
                      Limpar todos
                    </button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {loadingList ? (
                  <Loading message="Carregando ASOs..." />
                ) : registros.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    Nenhum registro de ASO encontrado.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className={cadastroListClasses.table}>
                      <thead>
                        <tr>
                          <th className={cadastroListClasses.th}>Funcionário</th>
                          <th className={cadastroListClasses.thCenter}>Tipo</th>
                          <th className={cadastroListClasses.thCenter}>Exame</th>
                          <th className={cadastroListClasses.thCenter}>Validade</th>
                          <th className={cadastroListClasses.thCenter}>Resultado</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registros.map((row) => (
                          <tr key={row.id} className={listTableRowClasses.tr}>
                            <td className="px-3 py-3">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {row.funcionario?.user?.name || '—'}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{row.funcionario?.position}</span>
                                {row.validadePadrao ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    Validade padrão
                                  </span>
                                ) : null}
                                {row.anexoUrl ? (
                                  <a
                                    href={absoluteUploadUrl(row.anexoUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
                                  >
                                    <FileText className="h-3 w-3" />
                                    Anexo
                                  </a>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center text-sm">
                              {row.tipoAso?.nome || '—'}
                            </td>
                            <td className="px-3 py-3 text-center text-sm">
                              {formatDateBr(row.dataExame)}
                            </td>
                            <td className="px-3 py-3 text-center text-sm">
                              <RowStatusBadge dataValidade={row.dataValidade} />
                            </td>
                            <td className="px-3 py-3 text-center text-sm">
                              {RESULTADO_LABEL[row.resultado]}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openRenovar(row)}
                                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  title="Renovar"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => triggerAnexoUpload(row.id)}
                                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  title="Enviar anexo"
                                >
                                  <Paperclip className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteId(row.id)}
                                  className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {pagination.totalPages > 1 ? (
                  <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>
                      Página {pagination.page} de {pagination.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded-lg border px-3 py-1 disabled:opacity-40 dark:border-gray-600"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={page >= pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-lg border px-3 py-1 disabled:opacity-40 dark:border-gray-600"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : tab === 'por-funcionario' ? (
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <div className={cadastroListClasses.cardHeaderRow}>
                  <div className={cadastroListClasses.cardHeaderIconRow}>
                    <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                      <Users className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                        Funcionários ativos
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {porFuncionario.length} funcionário{porFuncionario.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={pfSearch}
                      onChange={(e) => setPfSearch(e.target.value)}
                      placeholder="Buscar funcionário..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <SingleSelectSearchDropdown
                    value={pfDepartment}
                    onChange={setPfDepartment}
                    options={[{ value: '', label: 'Todos os setores' }, ...departmentFilterOptions]}
                    placeholder="Setor"
                    noFocusRing
                  />
                  <SingleSelectSearchDropdown
                    value={pfPosition}
                    onChange={setPfPosition}
                    options={[{ value: '', label: 'Todos os cargos' }, ...positionFilterOptions]}
                    placeholder="Cargo"
                    noFocusRing
                  />
                </div>
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {loadingPorFuncionario ? (
                  <Loading message="Carregando funcionários..." />
                ) : porFuncionario.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    Nenhum funcionário encontrado.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className={cadastroListClasses.table}>
                      <thead>
                        <tr>
                          <th className={cadastroListClasses.th}>Funcionário</th>
                          <th className={cadastroListClasses.thCenter}>Matrícula</th>
                          <th className={cadastroListClasses.thCenter}>Cargo</th>
                          <th className={cadastroListClasses.thCenter}>Setor</th>
                          <th className={cadastroListClasses.thCenter}>Último tipo</th>
                          <th className={cadastroListClasses.thCenter}>Exame</th>
                          <th className={cadastroListClasses.thCenter}>Validade</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porFuncionario.map((item) => {
                          const badge = PF_STATUS_LABEL[item.statusValidade];
                          return (
                            <tr key={item.funcionarioId} className={listTableRowClasses.tr}>
                              <td className="px-3 py-3">
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {item.nome}
                                </div>
                                {!item.hasPeriodicidadeCargo ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    Cargo sem periodicidade
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-3 text-center text-sm">{item.employeeId}</td>
                              <td className="px-3 py-3 text-center text-sm">{item.position}</td>
                              <td className="px-3 py-3 text-center text-sm">{item.department}</td>
                              <td className="px-3 py-3 text-center text-sm">
                                {item.ultimoAso?.tipoAso?.nome || '—'}
                              </td>
                              <td className="px-3 py-3 text-center text-sm">
                                {item.ultimoAso ? formatDateBr(item.ultimoAso.dataExame) : '—'}
                              </td>
                              <td className="px-3 py-3 text-center text-sm">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}
                                >
                                  {item.ultimoAso
                                    ? `${formatDateBr(item.ultimoAso.dataValidade)} · ${badge.label}`
                                    : badge.label}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setHistoricoFuncionarioId(item.funcionarioId)}
                                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    title="Ver histórico"
                                  >
                                    <History className="h-4 w-4" />
                                  </button>
                                  {item.ultimoAso ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRenovarFuncionario(item.funcionarioId)}
                                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                      title="Renovar ASO"
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => openCreateForFuncionario(item.funcionarioId)}
                                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                    title="Novo ASO"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Periodicidade por cargo
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Define o intervalo do ASO periódico. Sem cadastro, usa 12 meses.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <SingleSelectSearchDropdown
                        value={cargoForm.cargo}
                        onChange={(cargo) => setCargoForm((c) => ({ ...c, cargo }))}
                        options={cargoSelectOptions}
                        disabled={Boolean(editingCargo) || loadingCargosDisponiveis}
                        allowEmpty={false}
                        placeholder={
                          loadingCargosDisponiveis ? 'Carregando cargos...' : 'Selecionar cargo...'
                        }
                        searchPlaceholder="Pesquisar cargo..."
                        emptyOptionsMessage="Nenhum cargo disponível."
                        noFocusRing
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Mesmas opções do campo Cargo no cadastro de funcionários.
                      </p>
                    </div>
                    <SingleSelectSearchDropdown
                      value={cargoForm.grauRisco}
                      onChange={(v) => setCargoForm((c) => ({ ...c, grauRisco: v as AsoGrauRisco }))}
                      options={(Object.keys(GRAU_LABEL) as AsoGrauRisco[]).map((value) => ({
                        value,
                        label: GRAU_LABEL[value],
                      }))}
                      placeholder="Grau de risco"
                      noFocusRing
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        value={cargoForm.periodicidadeMeses}
                        onChange={(e) =>
                          setCargoForm((c) => ({ ...c, periodicidadeMeses: e.target.value }))
                        }
                        placeholder="Meses"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingCargo && !cargoForm.cargo.trim()) {
                            toast.error('Selecione um cargo');
                            return;
                          }
                          saveCargoMutation.mutate();
                        }}
                        disabled={saveCargoMutation.isPending}
                        className="shrink-0 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {editingCargo ? 'Salvar' : 'Add'}
                      </button>
                      {editingCargo ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCargo(null);
                            setCargoForm({ cargo: '', grauRisco: 'MEDIO', periodicidadeMeses: '12' });
                          }}
                          className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-600"
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {loadingCargos ? (
                    <Loading message="Carregando cargos..." />
                  ) : cargos.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">
                      Nenhum cargo cadastrado. Novos ASOs usarão 12 meses padrão.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className={cadastroListClasses.table}>
                        <thead>
                          <tr>
                            <th className={cadastroListClasses.th}>Cargo</th>
                            <th className={cadastroListClasses.thCenter}>Grau</th>
                            <th className={cadastroListClasses.thCenter}>Meses</th>
                            <th className={cadastroListClasses.thRight}>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cargos.map((c) => (
                            <tr key={c.id} className={listTableRowClasses.tr}>
                              <td className="px-3 py-3">{c.cargo}</td>
                              <td className="px-3 py-3 text-center">{GRAU_LABEL[c.grauRisco]}</td>
                              <td className="px-3 py-3 text-center">{c.periodicidadeMeses}</td>
                              <td className="px-3 py-3">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCargo(c);
                                      setCargoForm({
                                        cargo: c.cargo,
                                        grauRisco: c.grauRisco,
                                        periodicidadeMeses: String(c.periodicidadeMeses),
                                      });
                                    }}
                                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteCargoMutation.mutate(c.id)}
                                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div className={cadastroListClasses.cardHeaderIconRow}>
                      <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30 sm:p-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                          Cargos sem periodicidade
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Funcionários ativos cujo cargo usa os 12 meses padrão
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  {loadingCargosSemPeriodicidade ? (
                    <Loading message="Carregando..." />
                  ) : cargosSemPeriodicidade.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      Todos os cargos ativos possuem periodicidade cadastrada.
                    </p>
                  ) : (
                    cargosSemPeriodicidade.map((item) => (
                      <button
                        key={item.cargo}
                        type="button"
                        onClick={() => {
                          setEditingCargo(null);
                          setCargoForm((c) => ({ ...c, cargo: item.cargo }));
                        }}
                        className="flex w-full flex-col gap-1 rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-red-300 dark:border-gray-700 dark:hover:border-red-800"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {item.cargo}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            {item.funcionarios.length} funcionário
                            {item.funcionarios.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {item.funcionarios.map((f) => f.nome).join(', ')}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <Modal
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          title={editing ? 'Editar ASO' : 'Novo ASO'}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Funcionário *</label>
              <SingleSelectSearchDropdown
                value={form.funcionarioId}
                onChange={(funcionarioId) => setForm((f) => ({ ...f, funcionarioId }))}
                options={employeeOptions}
                disabled={Boolean(editing)}
                placeholder="Selecionar funcionário..."
                searchPlaceholder="Pesquisar..."
                noFocusRing
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Tipo de ASO *</label>
              <SingleSelectSearchDropdown
                value={form.tipoAsoId}
                onChange={(tipoAsoId) => setForm((f) => ({ ...f, tipoAsoId }))}
                options={tipoOptions}
                placeholder="Selecionar tipo..."
                noFocusRing
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Data do exame *</label>
                <input
                  type="date"
                  value={form.dataExame}
                  onChange={(e) => setForm((f) => ({ ...f, dataExame: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Validade (calculada)</label>
                <input
                  type="text"
                  readOnly
                  value={
                    preview
                      ? `${formatDateBr(preview.dataValidade)} (${preview.periodicidadeMeses} meses${
                          preview.validadePadrao ? ' — padrão' : ''
                        })`
                      : 'Selecione funcionário e data'
                  }
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
                {preview?.validadePadrao ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Cargo sem periodicidade em Cargos e risco — usando 12 meses.
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Resultado *</label>
              <SingleSelectSearchDropdown
                value={form.resultado}
                onChange={(resultado) => setForm((f) => ({ ...f, resultado: resultado as AsoResultado }))}
                options={resultadoOptions}
                placeholder="Selecionar..."
                noFocusRing
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Médico responsável *</label>
                <input
                  value={form.medicoResponsavel}
                  onChange={(e) => setForm((f) => ({ ...f, medicoResponsavel: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">CRM *</label>
                <input
                  value={form.crmMedico}
                  onChange={(e) => setForm((f) => ({ ...f, crmMedico: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Clínica *</label>
              <input
                value={form.clinica}
                onChange={(e) => setForm((f) => ({ ...f, clinica: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Anexo (PDF ou imagem){editing?.anexoUrl ? ' — substituir' : ''}
              </label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setAnexoFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
              {editing?.anexoUrl ? (
                <a
                  href={absoluteUploadUrl(editing.anexoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  <FileText className="h-3 w-3" />
                  Ver anexo atual
                </a>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Observações</label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {editing ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(historicoFuncionarioId)}
          onClose={() => setHistoricoFuncionarioId(null)}
          title="Histórico de ASO"
          size="lg"
        >
          {loadingHistorico ? (
            <Loading message="Carregando histórico..." />
          ) : !historicoData ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum dado encontrado.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {historicoData.funcionario?.user?.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {historicoData.funcionario?.position} · {historicoData.funcionario?.department} · Mat.{' '}
                  {historicoData.funcionario?.employeeId}
                </p>
              </div>

              {historicoData.registros.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhum ASO registrado para este funcionário.
                </p>
              ) : (
                <div className="space-y-4 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
                  {historicoData.registros.map((r) => {
                    const classe = classifyValidade(r.dataValidade);
                    const dotColor =
                      classe === 'vencido'
                        ? 'bg-red-500'
                        : classe === 'valido'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500';
                    return (
                      <div key={r.id} className="relative pb-1">
                        <span
                          className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full ${dotColor}`}
                          aria-hidden
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {r.tipoAso?.nome || 'ASO'}
                          </span>
                          <RowStatusBadge dataValidade={r.dataValidade} />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Exame em {formatDateBr(r.dataExame)} · {RESULTADO_LABEL[r.resultado]}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {r.medicoResponsavel} (CRM {r.crmMedico}) · {r.clinica}
                        </p>
                        {r.observacoes ? (
                          <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                            {r.observacoes}
                          </p>
                        ) : null}
                        {r.anexoUrl ? (
                          <a
                            href={absoluteUploadUrl(r.anexoUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
                          >
                            <FileText className="h-3 w-3" />
                            Ver anexo
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Modal>

        <Modal isOpen={Boolean(deleteId)} onClose={() => setDeleteId(null)} title="Excluir ASO">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tem certeza que deseja excluir este registro de ASO?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteId(null)}
              className="rounded-lg border px-4 py-2 text-sm dark:border-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Excluir
            </button>
          </div>
        </Modal>

        <SpreadsheetImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Importar ASOs"
          templateHint="Preencha a planilha (modelo ou o mesmo formato do Exportar). A validade é calculada automaticamente pelo cargo/risco. Identifique o funcionário por Matrícula (preferencial), CPF ou nome."
          columns={ASO_IMPORT_COLUMNS}
          bodyKey="registros"
          importPath="/aso/registros/import"
          batchSize={50}
          downloadTemplate={downloadAsoImportTemplate}
          parseFile={async (file) => {
            const report = await parseAsosFromFile(file);
            return {
              items: report.items as unknown as Record<string, unknown>[],
              skipped: report.skipped,
              totalRows: report.totalRows,
            };
          }}
          onImported={() => {
            void queryClient.invalidateQueries({ queryKey: ['aso-registros'] });
            void queryClient.invalidateQueries({ queryKey: ['aso-dashboard'] });
            void queryClient.invalidateQueries({ queryKey: ['aso-por-funcionario'] });
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
