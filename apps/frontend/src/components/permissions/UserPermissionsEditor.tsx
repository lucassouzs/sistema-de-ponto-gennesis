'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Layers,
  ShieldCheck,
  User,
  Wallet,
  HardHat,
  Package,
  FolderOpen,
  Clock,
  SlidersHorizontal,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import {
  PERMISSION_ACCESS_ACTION,
  PERMISSION_CONTROLE_CATEGORY,
  PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX,
  PERMISSION_MODULES,
  pathToModuleKey,
  type PermissionModuleDef,
} from '@sistema-ponto/permission-modules';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

/** Orçamento e relatórios fotográficos: só pela aba «Contratos», não pela matriz «Acesso». */
const HIDDEN_FROM_ACCESS_MATRIX = new Set(PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX);

type PermissionItem = { module: string; action: string };

type ContractModuleFlags = {
  orcamento: boolean;
  relatorios: boolean;
  ordemServico: boolean;
  producaoSemanal: boolean;
};

type UserPermissionPayload = {
  user: { id: string; name: string; email: string; employee?: { position?: string | null } };
  isAdmin: boolean;
  permissions: PermissionItem[];
  allowedContractIds: string[];
  dpApprovalContractIds?: string[];
  contractModuleFlags?: Record<string, ContractModuleFlags>;
};
type PermissionUserListItem = {
  id: string;
  name: string;
  email: string;
  employee?: { position?: string; department?: string };
};

export type PermissionsTargetPreview = {
  id: string;
  name: string;
  email: string;
  position?: string;
};

function serializePermissionSet(s: Set<string>): string {
  return Array.from(s).sort().join('\u0000');
}

const CONTRACTS_MODULE_KEY = pathToModuleKey('/ponto/contratos');
const EMPLOYEES_MODULE_KEY = pathToModuleKey('/ponto/funcionarios');
/** Removido da UI (gestor por contrato na aba Contratos); ainda pode existir no banco até o próximo salvamento. */
const DEPRECATED_DP_APPROVE_CONTROLE_KEY = pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp');
const CONTRACT_ACTIONS = ['ver', 'criar', 'editar', 'excluir'] as const;
type ContractAction = (typeof CONTRACT_ACTIONS)[number];

function serializeContractActions(s: Set<ContractAction>): string {
  return Array.from(s).sort().join(',');
}

function serializeContractIds(s: Set<string>): string {
  return Array.from(s).sort().join(',');
}

function serializeModuleFlags(flags: Record<string, ContractModuleFlags>): string {
  return Object.keys(flags)
    .sort()
    .map((id) => {
      const f = flags[id];
      return `${id}:${f.orcamento ? 1 : 0}${f.relatorios ? 1 : 0}${f.ordemServico ? 1 : 0}${f.producaoSemanal ? 1 : 0}`;
    })
    .join(',');
}

function serializeFullBaseline(
  selected: Set<string>,
  contractActions: Set<ContractAction>,
  contractIds: Set<string>,
  employeeActions: Set<ContractAction>,
  dpApprovalContractIds: Set<string>,
  moduleFlags: Record<string, ContractModuleFlags>
): string {
  return `${serializePermissionSet(selected)}|ca:${serializeContractActions(contractActions)}|cid:${serializeContractIds(contractIds)}|ea:${serializeContractActions(employeeActions)}|dp:${serializeContractIds(dpApprovalContractIds)}|mf:${serializeModuleFlags(moduleFlags)}`;
}

/** Mesmo formato retornado por GET /permissions/users/:id (alinha cache do React Query ao PUT). */
function buildPermissionsSnapshotForCache(
  selected: Set<string>,
  contractActions: Set<ContractAction>,
  contractIds: Set<string>,
  employeeActions: Set<ContractAction>
): PermissionItem[] {
  const hasAnyContractsData =
    selected.has(CONTRACTS_MODULE_KEY) ||
    contractActions.size > 0 ||
    contractIds.size > 0;
  const hasAnyEmployeesData =
    selected.has(EMPLOYEES_MODULE_KEY) || employeeActions.size > 0;
  const modules = new Set(selected);
  if (hasAnyContractsData) {
    modules.add(CONTRACTS_MODULE_KEY);
  }
  if (hasAnyEmployeesData) {
    modules.add(EMPLOYEES_MODULE_KEY);
  }
  const out: PermissionItem[] = [];
  for (const module of Array.from(modules)) {
    if (module === DEPRECATED_DP_APPROVE_CONTROLE_KEY) continue;
    out.push({ module, action: PERMISSION_ACCESS_ACTION });
  }
  for (const action of Array.from(contractActions)) {
    out.push({ module: CONTRACTS_MODULE_KEY, action });
  }
  for (const action of Array.from(employeeActions)) {
    out.push({ module: EMPLOYEES_MODULE_KEY, action });
  }
  return out;
}

type ContractOption = { id: string; name: string; number: string };

const CATEGORY_ORDER = [
  'Principal',
  'Painel de Controle',
  'Departamento Pessoal',
  'Financeiro',
  'Engenharia',
  'Suprimentos',
  'Cadastros',
  'Registros de Ponto',
  PERMISSION_CONTROLE_CATEGORY,
  'Outros',
];

/**
 * Quando o pacote `permission-modules` estiver com `dist` desatualizado, `category` pode vir ausente
 * e o agrupamento falhava (tabela vazia). Inferimos pela rota.
 */
function inferCategoryFromHref(href: string): string {
  const h = href.replace(/\/$/, '') || '/';
  if (
    [
      '/ponto/dashboard',
      '/ponto/conversas-whatsapp',
      '/ponto/aprovacoes',
      '/ponto/financeiro/gestao-solicitacoes',
      '/ponto/drive',
    ].some((p) => h === p)
  ) {
    return 'Principal';
  }
  if (h === '/ponto/permissoes') return 'Painel de Controle';
  if (
    [
      '/ponto/funcionarios',
      '/ponto/folha-pagamento',
      '/ponto/atestados',
      '/ponto/gerenciar-atestados',
      '/ponto/solicitacoes',
      '/ponto/gerenciar-solicitacoes',
      '/ponto/ferias',
      '/ponto/gerenciar-ferias',
      '/ponto/gerenciar-feriados',
      '/ponto/banco-horas',
      '/relatorios/alocacao',
      '/ponto/aniversariantes',
    ].some((p) => h === p)
  ) {
    return 'Departamento Pessoal';
  }
  if (h.startsWith('/ponto/financeiro')) return 'Financeiro';
  if (
    [
      '/ponto/orcamento',
      '/ponto/contratos',
      '/ponto/contratos/controle-geral',
      '/ponto/contratos/relatorios',
      '/ponto/andamento-da-os',
      '/ponto/pleitos-gerados',
    ].some((p) => h === p)
  ) {
    return 'Engenharia';
  }
  if (
    [
      '/ponto/solicitar-materiais',
      '/ponto/gerenciar-materiais',
      '/ponto/mapa-cotacao',
      '/ponto/ordem-de-compra',
    ].some((p) => h === p)
  ) {
    return 'Suprimentos';
  }
  if (
    [
      '/ponto/centros-custo',
      '/ponto/materiais-construcao',
      '/ponto/fornecedores',
      '/ponto/condicoes-pagamento',
      '/ponto/natureza-orcamentaria',
    ].some((p) => h === p)
  ) {
    return 'Cadastros';
  }
  if (h === '/ponto') return 'Registros de Ponto';
  if (h.startsWith('/ponto/controle')) return PERMISSION_CONTROLE_CATEGORY;
  return 'Outros';
}

function moduleCategory(m: PermissionModuleDef): string {
  const c = (m as { category?: string }).category?.trim();
  return c || inferCategoryFromHref(m.href);
}

/** Nome amigável — nunca exibe rota crua na UI (fallback se `name` vier como path). */
function displayModuleName(m: PermissionModuleDef): string {
  const raw = (m.name || '').trim();
  if (!raw) return 'Módulo';
  if (raw.startsWith('/')) {
    const s = raw
      .replace(/^\/ponto\/?/i, '')
      .replace(/\//g, ' › ')
      .replace(/-/g, ' ');
    return s || raw;
  }
  return raw;
}

function moduleIcon(href: string): LucideIcon {
  if (href.includes('dashboard')) return LayoutDashboard;
  if (href.includes('financeiro')) return Wallet;
  if (href.includes('contratos') || href.includes('orcamento') || href.includes('os') || href.includes('pleitos'))
    return HardHat;
  if (
    href.includes('materiais') ||
    href.includes('cotacao') ||
    href.includes('compra') ||
    href.includes('fornecedores')
  )
    return Package;
  if (href.includes('centros-custo') || href.includes('natureza') || href.includes('condicoes'))
    return FolderOpen;
  if (href === '/ponto') return Clock;
  if (href.startsWith('/relatorios')) return Layers;
  if (href.startsWith('/ponto/controle')) return Settings;
  if (href.includes('permissoes')) return SlidersHorizontal;
  if (href.includes('funcionarios') || href.includes('ferias') || href.includes('atestados')) return User;
  return Layers;
}

/** Célula da grade — quadrado vermelho + “Sim/Não” à direita (referência tipo SaaS). */
function PermissionMatrixCheckbox({
  checked,
  onCheckedChange,
  id,
  'aria-label': ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex select-none items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'group cursor-pointer'}`}
    >
      <div className="relative shrink-0">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onCheckedChange(e.target.checked)}
          aria-label={ariaLabel}
        />
        <div
          className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors duration-150 ${
            checked
              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
              : 'border-gray-300 bg-white dark:border-gray-500 dark:bg-gray-800 group-hover:border-gray-400 dark:group-hover:border-gray-400'
          }`}
        >
          {checked && (
            <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span
        className={`min-w-[1.75rem] text-sm font-medium tabular-nums ${
          checked ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {checked ? 'Sim' : 'Não'}
      </span>
    </label>
  );
}

export type PermissionEditorTab = 'gerais' | 'contratos' | 'controle';

/** Barra de abas no mesmo estilo da página Orçamento (alinhada à esquerda, borda inferior, ícone + rótulo). */
export function UserPermissionsTabBar({
  activeTab,
  onChange,
  showContracts = true,
  className = '',
}: {
  activeTab: PermissionEditorTab;
  onChange: (tab: PermissionEditorTab) => void;
  showContracts?: boolean;
  className?: string;
}) {
  const items = [
    { id: 'gerais' as const, label: 'Acesso', icon: ShieldCheck, disabled: false as const },
    { id: 'contratos' as const, label: 'Contratos', icon: FileText, disabled: !showContracts },
    { id: 'controle' as const, label: 'Controle', icon: Settings, disabled: false as const },
  ];

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
        {items.map((t) => {
          const Icon = t.icon;
          const isActive = !t.disabled && activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (!t.disabled) onChange(t.id);
              }}
              disabled={t.disabled}
              aria-disabled={t.disabled}
              title={t.disabled ? 'Ative o módulo Contratos na aba Acesso' : undefined}
              className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors rounded-t-lg ${
                t.disabled
                  ? 'cursor-not-allowed text-gray-400 opacity-70 dark:text-gray-500'
                  : isActive
                    ? 'bg-red-600 text-white dark:bg-red-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : ''}`} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UserSearchSelect({
  users,
  searchValue,
  onSearchValueChange,
  selectedUserId,
  onSelectUserId,
}: {
  users: PermissionUserListItem[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  selectedUserId: string;
  onSelectUserId: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);
  const query = searchValue.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!query) return users;
    return users.filter((u) => u.name.toLowerCase().includes(query));
  }, [users, query]);

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={searchValue}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        onChange={(e) => {
          onSearchValueChange(e.target.value);
          onSelectUserId('');
          if (!isOpen) setIsOpen(true);
        }}
        placeholder="Selecionar usuário..."
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />

      {isOpen && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {filteredUsers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nenhum funcionário encontrado.</div>
          ) : (
            filteredUsers.map((u) => {
              const isSelected = u.id === selectedUserId || (!selectedUserId && selectedUser?.id === u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectUserId(u.id);
                    onSearchValueChange(u.name);
                    setIsOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {u.name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface UserPermissionsEditorProps {
  /** Ignorado quando `positionTemplate` está definido. */
  userId: string;
  preview: PermissionsTargetPreview;
  onBack: () => void;
  /** Quando true, não renderiza a barra Voltar + título (usado na página Funcionários com cabeçalho externo). */
  hideTopNavigation?: boolean;
  /**
   * Abas controladas pela página (ex.: barra fora do card, abaixo do título).
   * Se `onPermissionTabChange` for passado, a barra de abas **não** é renderizada dentro do card.
   */
  permissionTab?: PermissionEditorTab;
  onPermissionTabChange?: (tab: PermissionEditorTab) => void;
  onContractsTabAvailabilityChange?: (available: boolean) => void;
  /** Edita template salvo em `/permissions/position-template` (página Permissões — por cargo). */
  positionTemplate?: string | null;
}

export function UserPermissionsEditor({
  userId,
  preview,
  onBack,
  hideTopNavigation = false,
  permissionTab: permissionTabProp,
  onPermissionTabChange,
  onContractsTabAvailabilityChange,
  positionTemplate: positionTemplateProp,
}: UserPermissionsEditorProps) {
  const positionTemplate = positionTemplateProp?.trim() ?? '';
  const isPositionMode = positionTemplate.length > 0;
  const queryClient = useQueryClient();
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [contractActionsSet, setContractActionsSet] = useState<Set<ContractAction>>(new Set());
  const [employeeActionsSet, setEmployeeActionsSet] = useState<Set<ContractAction>>(new Set());
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(new Set());
  const [selectedDpApprovalContractIds, setSelectedDpApprovalContractIds] = useState<Set<string>>(new Set());
  const [contractModuleFlags, setContractModuleFlags] = useState<Record<string, ContractModuleFlags>>({});
  const [copyFromUserIdGeneral, setCopyFromUserIdGeneral] = useState('');
  const [copyFromUserIdContracts, setCopyFromUserIdContracts] = useState('');
  const [copyGeneralSearch, setCopyGeneralSearch] = useState('');
  const [copyContractsSearch, setCopyContractsSearch] = useState('');
  const [isApplyingCopyGeneral, setIsApplyingCopyGeneral] = useState(false);
  const [isApplyingCopyContracts, setIsApplyingCopyContracts] = useState(false);
  const [internalTab, setInternalTab] = useState<PermissionEditorTab>('gerais');
  const tabsControlled = typeof onPermissionTabChange === 'function';
  const activeTab = tabsControlled ? (permissionTabProp ?? 'gerais') : internalTab;
  const setActiveTab = tabsControlled ? onPermissionTabChange! : setInternalTab;
  const selectedSetRef = useRef(selectedSet);
  selectedSetRef.current = selectedSet;
  const contractActionsRef = useRef(contractActionsSet);
  contractActionsRef.current = contractActionsSet;
  const selectedContractIdsRef = useRef(selectedContractIds);
  selectedContractIdsRef.current = selectedContractIds;
  const employeeActionsRef = useRef(employeeActionsSet);
  employeeActionsRef.current = employeeActionsSet;
  const selectedDpApprovalContractIdsRef = useRef(selectedDpApprovalContractIds);
  selectedDpApprovalContractIdsRef.current = selectedDpApprovalContractIds;
  const contractModuleFlagsRef = useRef(contractModuleFlags);
  contractModuleFlagsRef.current = contractModuleFlags;

  /** Serialização estável para comparar com o último estado vindo do servidor (evita PUT na hidratação). */
  const baselineSerializedRef = useRef<string | null>(null);

  const {
    data: userPermissionData,
    isLoading: loadingPermissions,
    error: permissionError,
  } = useQuery({
    queryKey: isPositionMode ? ['position-permission-template', positionTemplate] : ['permission-user', userId],
    queryFn: async () => {
      if (isPositionMode) {
        const res = await api.get('/permissions/position-template', { params: { position: positionTemplate } });
        const d = res.data?.data as {
          position: string;
          permissions: UserPermissionPayload['permissions'];
          allowedContractIds: string[];
          dpApprovalContractIds?: string[];
          contractModuleFlags?: Record<string, ContractModuleFlags>;
        };
        return {
          user: {
            id: '',
            name: d.position,
            email: '',
            employee: { position: d.position },
          },
          isAdmin: false,
          permissions: d.permissions ?? [],
          allowedContractIds: d.allowedContractIds ?? [],
          dpApprovalContractIds: d.dpApprovalContractIds ?? [],
          contractModuleFlags: d.contractModuleFlags ?? {},
        } as UserPermissionPayload;
      }
      return (await api.get(`/permissions/users/${userId}`)).data?.data as UserPermissionPayload;
    },
    enabled: isPositionMode ? true : !!userId,
    retry: false,
  });

  const { data: contractsList = [] } = useQuery({
    queryKey: ['permission-contracts-list'],
    queryFn: async () => (await api.get('/permissions/contracts')).data?.data as ContractOption[],
    enabled: (isPositionMode || !!userId) && !!userPermissionData && !userPermissionData.isAdmin,
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });

  const { data: permissionUsers = [] } = useQuery({
    queryKey: ['permission-users'],
    queryFn: async () => (await api.get('/permissions/users')).data?.data as PermissionUserListItem[],
    enabled: !isPositionMode && !!userId,
    retry: false,
  });
  const copyableUsers = useMemo(
    () =>
      permissionUsers.filter((u) => {
        if (u.id === userId) return false;
        const position = (u.employee?.position || '').trim().toLowerCase();
        const name = (u.name || '').trim().toLowerCase();
        return position !== 'administrador' && name !== 'administrador';
      }),
    [permissionUsers, userId]
  );

  useEffect(() => {
    if (!userPermissionData?.permissions) {
      setSelectedSet(new Set());
      setContractActionsSet(new Set());
      setEmployeeActionsSet(new Set());
      setSelectedContractIds(new Set());
      setSelectedDpApprovalContractIds(new Set());
      setContractModuleFlags({});
      baselineSerializedRef.current = serializeFullBaseline(
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        {}
      );
      return;
    }
    const perms = userPermissionData.permissions;
    const next = new Set<string>(
      perms.filter((p) => p.action === PERMISSION_ACCESS_ACTION).map((p) => p.module)
    );
    next.delete(DEPRECATED_DP_APPROVE_CONTROLE_KEY);
    PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX.forEach((k) => next.delete(k));
    const nextContract = new Set<ContractAction>();
    const nextEmployee = new Set<ContractAction>();
    for (const p of perms) {
      if (p.module === CONTRACTS_MODULE_KEY && CONTRACT_ACTIONS.includes(p.action as ContractAction)) {
        nextContract.add(p.action as ContractAction);
      }
      if (p.module === EMPLOYEES_MODULE_KEY && CONTRACT_ACTIONS.includes(p.action as ContractAction)) {
        nextEmployee.add(p.action as ContractAction);
      }
    }
    const nextContractIds = new Set(userPermissionData.allowedContractIds ?? []);
    const rawDp = new Set(userPermissionData.dpApprovalContractIds ?? []);
    const nextDpApproval = new Set(Array.from(rawDp).filter((id) => nextContractIds.has(id)));
    const rawFlags = userPermissionData.contractModuleFlags ?? {};
    const emptyFlags = (): ContractModuleFlags => ({
      orcamento: false,
      relatorios: false,
      ordemServico: false,
      producaoSemanal: false,
    });
    const nextFlags: Record<string, ContractModuleFlags> = {};
    for (const id of Array.from(nextContractIds)) {
      nextFlags[id] = rawFlags[id] ?? emptyFlags();
    }
    setSelectedSet(next);
    setContractActionsSet(nextContract);
    setEmployeeActionsSet(nextEmployee);
    setSelectedContractIds(nextContractIds);
    setSelectedDpApprovalContractIds(nextDpApproval);
    setContractModuleFlags(nextFlags);
    baselineSerializedRef.current = serializeFullBaseline(
      next,
      nextContract,
      nextContractIds,
      nextEmployee,
      nextDpApproval,
      nextFlags
    );
  }, [userPermissionData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const currentSelected = new Set(selectedSetRef.current);
      const currentContractActions = Array.from(contractActionsRef.current);
      const currentEmployeeActions = Array.from(employeeActionsRef.current);
      const currentContractIds = Array.from(selectedContractIdsRef.current);
      const hasAnyContractsData =
        currentSelected.has(CONTRACTS_MODULE_KEY) ||
        currentContractActions.length > 0 ||
        currentContractIds.length > 0;
      const hasAnyEmployeesData =
        currentSelected.has(EMPLOYEES_MODULE_KEY) || currentEmployeeActions.length > 0;

      // Segurança: se houver qualquer dado de contratos, garante o acesso base no payload.
      if (hasAnyContractsData) {
        currentSelected.add(CONTRACTS_MODULE_KEY);
      }
      if (hasAnyEmployeesData) {
        currentSelected.add(EMPLOYEES_MODULE_KEY);
      }

      const basePermissions = Array.from(currentSelected).map((module) => ({ module }));
      const contractActionPermissions = currentContractActions.map((action) => ({
        module: CONTRACTS_MODULE_KEY,
        action,
      }));
      const employeeActionPermissions = currentEmployeeActions.map((action) => ({
        module: EMPLOYEES_MODULE_KEY,
        action,
      }));
      const permissions = [...basePermissions, ...contractActionPermissions, ...employeeActionPermissions];
      const allowedContractIds = currentContractIds;
      const dpApprovalContractIds = Array.from(selectedDpApprovalContractIdsRef.current);
      const contractModuleFlagsPayload = contractModuleFlagsRef.current;
      if (isPositionMode) {
        await api.put('/permissions/position-template', {
          position: positionTemplate,
          permissions,
          allowedContractIds,
          dpApprovalContractIds,
          contractModuleFlags: contractModuleFlagsPayload,
        });
      } else {
        await api.put(`/permissions/users/${userId}`, {
          permissions,
          allowedContractIds,
          dpApprovalContractIds,
          contractModuleFlags: contractModuleFlagsPayload,
        });
      }
    },
    onSuccess: async () => {
      // Evita "piscar" os checkboxes por re-hidratação imediata após cada clique.
      baselineSerializedRef.current = serializeFullBaseline(
        selectedSetRef.current,
        contractActionsRef.current,
        selectedContractIdsRef.current,
        employeeActionsRef.current,
        selectedDpApprovalContractIdsRef.current,
        contractModuleFlagsRef.current
      );
      await queryClient.invalidateQueries({ queryKey: ['permission-users'] });
      await queryClient.invalidateQueries({ queryKey: ['me-permissions'] });
      if (isPositionMode) {
        await queryClient.invalidateQueries({ queryKey: ['position-permission-template', positionTemplate] });
        await queryClient.invalidateQueries({ queryKey: ['permission-positions-list'] });
        await queryClient.invalidateQueries({ queryKey: ['permission-position-summaries'] });
      } else if (userId) {
        // staleTime global (5 min): sem atualizar este cache, ao reabrir o editor vinham dados antigos
        // (ex.: aba Controle parecia não salvar).
        const snapshot = buildPermissionsSnapshotForCache(
          selectedSetRef.current,
          contractActionsRef.current,
          selectedContractIdsRef.current,
          employeeActionsRef.current
        );
        queryClient.setQueryData<UserPermissionPayload | undefined>(['permission-user', userId], (old) => {
          if (!old) return old;
          const updatedFlags = contractModuleFlagsRef.current;
          return {
            ...old,
            permissions: snapshot,
            allowedContractIds: Array.from(selectedContractIdsRef.current),
            dpApprovalContractIds: Array.from(selectedDpApprovalContractIdsRef.current),
            contractModuleFlags: updatedFlags,
          };
        });
      }
    },
    onError: (error: unknown) => {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Erro ao salvar permissões.');
    },
  });

  const { mutate: persistPermissions, mutateAsync: persistPermissionsAsync, isPending: isSavingPermissions } =
    saveMutation;

  /** Salva automaticamente após alterações (debounce), sem disparar na sincronização inicial com o servidor. */
  useEffect(() => {
    if (loadingPermissions || permissionError) return;
    if (baselineSerializedRef.current === null) return;

    const serialized = serializeFullBaseline(
      selectedSet,
      contractActionsSet,
      selectedContractIds,
      employeeActionsSet,
      selectedDpApprovalContractIds,
      contractModuleFlags
    );
    if (serialized === baselineSerializedRef.current) return;

    const t = window.setTimeout(() => {
      const latest = serializeFullBaseline(
        selectedSetRef.current,
        contractActionsRef.current,
        selectedContractIdsRef.current,
        employeeActionsRef.current,
        selectedDpApprovalContractIdsRef.current,
        contractModuleFlagsRef.current
      );
      if (latest === baselineSerializedRef.current) return;
      persistPermissions();
    }, 450);

    return () => window.clearTimeout(t);
  }, [
    selectedSet,
    contractActionsSet,
    employeeActionsSet,
    selectedContractIds,
    selectedDpApprovalContractIds,
    contractModuleFlags,
    loadingPermissions,
    permissionError,
    persistPermissions,
  ]);

  // Garante persistência ao sair da tela (ex.: botão Voltar externo/página pai),
  // mesmo que o debounce ainda não tenha disparado.
  useEffect(() => {
    return () => {
      if (baselineSerializedRef.current === null) return;
      const latest = serializeFullBaseline(
        selectedSetRef.current,
        contractActionsRef.current,
        selectedContractIdsRef.current,
        employeeActionsRef.current,
        selectedDpApprovalContractIdsRef.current,
        contractModuleFlagsRef.current
      );
      if (latest === baselineSerializedRef.current) return;
      persistPermissions();
    };
  }, [persistPermissions]);

  const modulesByCategory = useMemo(() => {
    const map = new Map<string, PermissionModuleDef[]>();
    for (const m of PERMISSION_MODULES) {
      const cat = moduleCategory(m);
      if (cat === PERMISSION_CONTROLE_CATEGORY) continue;
      if (HIDDEN_FROM_ACCESS_MATRIX.has(m.key)) continue;
      const list = map.get(cat) ?? [];
      list.push(m);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, modules: map.get(c)! }));
  }, []);

  const controleModulesByCategory = useMemo(() => {
    const map = new Map<string, PermissionModuleDef[]>();
    for (const m of PERMISSION_MODULES) {
      const cat = moduleCategory(m);
      if (cat !== PERMISSION_CONTROLE_CATEGORY) continue;
      if (m.key === DEPRECATED_DP_APPROVE_CONTROLE_KEY) continue;
      const list = map.get(cat) ?? [];
      list.push(m);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, modules: map.get(c)! }));
  }, []);

  const toggleModule = (key: string) => {
    setSelectedSet((prev) => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
        if (key === CONTRACTS_MODULE_KEY) {
          setContractActionsSet(new Set());
          setSelectedContractIds(new Set());
        }
        if (key === EMPLOYEES_MODULE_KEY) {
          setEmployeeActionsSet(new Set());
        }
      } else {
        n.add(key);
      }
      return n;
    });
  };

  const toggleContractAction = (action: ContractAction) => {
    setContractActionsSet((prev) => {
      const n = new Set(prev);
      const isTurningOn = !n.has(action);

      if (!isTurningOn) n.delete(action);
      else n.add(action);

      // Regras de consistência:
      // - Ao marcar criar/editar/excluir, marca automaticamente "ver".
      // - Ao desmarcar "ver", limpa também as ações dependentes.
      if (isTurningOn && action !== 'ver') {
        n.add('ver');
      }
      if (!isTurningOn && action === 'ver') {
        n.delete('criar');
        n.delete('editar');
        n.delete('excluir');
      }

      // Garante acesso ao módulo quando há qualquer ação granular; não remove o módulo ao zerar
      // (fica só `acesso` no banco, como na página Permissões).
      setSelectedSet((s) => {
        const m = new Set(s);
        if (n.size > 0) m.add(CONTRACTS_MODULE_KEY);
        return m;
      });
      return n;
    });
  };

  const toggleEmployeeAction = (action: ContractAction) => {
    setEmployeeActionsSet((prev) => {
      const n = new Set(prev);
      const isTurningOn = !n.has(action);

      if (!isTurningOn) n.delete(action);
      else n.add(action);

      if (isTurningOn && action !== 'ver') {
        n.add('ver');
      }
      if (!isTurningOn && action === 'ver') {
        n.delete('criar');
        n.delete('editar');
        n.delete('excluir');
      }

      setSelectedSet((s) => {
        const m = new Set(s);
        if (n.size > 0) m.add(EMPLOYEES_MODULE_KEY);
        return m;
      });
      return n;
    });
  };

  const toggleContract = (contractId: string) => {
    setSelectedContractIds((prev) => {
      const n = new Set(prev);
      if (n.has(contractId)) {
        n.delete(contractId);
        setSelectedDpApprovalContractIds((dp) => {
          const d = new Set(dp);
          d.delete(contractId);
          return d;
        });
        setContractModuleFlags((f) => {
          const next = { ...f };
          delete next[contractId];
          return next;
        });
      } else {
        n.add(contractId);
        setContractModuleFlags((f) => ({
          ...f,
          [contractId]: f[contractId] ?? {
            orcamento: false,
            relatorios: false,
            ordemServico: false,
            producaoSemanal: false,
          },
        }));
      }
      return n;
    });
  };

  const setContractModuleFlag = (contractId: string, key: keyof ContractModuleFlags, value: boolean) => {
    if (value) {
      setSelectedContractIds((prev) => new Set(prev).add(contractId));
    }
    setContractModuleFlags((prev) => {
      const current = prev[contractId] ?? {
        orcamento: false,
        relatorios: false,
        ordemServico: false,
        producaoSemanal: false,
      };
      return { ...prev, [contractId]: { ...current, [key]: value } };
    });
  };

  const toggleDpApprovalContract = (contractId: string) => {
    setSelectedDpApprovalContractIds((prev) => {
      const n = new Set(prev);
      if (n.has(contractId)) n.delete(contractId);
      else n.add(contractId);
      return n;
    });
  };

  const fetchSourceUserPermissions = async (sourceUserId: string): Promise<UserPermissionPayload | null> => {
    const res = await api.get(`/permissions/users/${sourceUserId}`);
    const source = res.data?.data as UserPermissionPayload;
    if (!source || source.isAdmin) return null;
    return source;
  };

  const handleCopyGeneralFromUser = async () => {
    if (!copyFromUserIdGeneral) return;
    if (!isPositionMode && copyFromUserIdGeneral === userId) {
      toast('Selecione outro usuário para copiar.');
      return;
    }
    try {
      setIsApplyingCopyGeneral(true);
      const source = await fetchSourceUserPermissions(copyFromUserIdGeneral);
      if (!source) {
        toast.error('Não é possível copiar de usuário Administrador.');
        return;
      }
      const nextGeneral = new Set<string>(
        (source.permissions || [])
          .filter((p) => p.action === PERMISSION_ACCESS_ACTION)
          .map((p) => p.module)
      );
      nextGeneral.delete(DEPRECATED_DP_APPROVE_CONTROLE_KEY);
      PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX.forEach((k) => nextGeneral.delete(k));
      const nextContractActions = new Set<ContractAction>();
      const nextEmployeeActions = new Set<ContractAction>();
      for (const p of source.permissions || []) {
        if (p.module === CONTRACTS_MODULE_KEY && CONTRACT_ACTIONS.includes(p.action as ContractAction)) {
          nextContractActions.add(p.action as ContractAction);
        }
        if (p.module === EMPLOYEES_MODULE_KEY && CONTRACT_ACTIONS.includes(p.action as ContractAction)) {
          nextEmployeeActions.add(p.action as ContractAction);
        }
      }
      setSelectedSet(nextGeneral);
      setContractActionsSet(nextContractActions);
      setEmployeeActionsSet(nextEmployeeActions);
      const allowedSrc = new Set(source.allowedContractIds ?? []);
      setSelectedDpApprovalContractIds(
        new Set(
          [...(source.dpApprovalContractIds ?? [])].filter(
            (id) => allowedSrc.has(id) && selectedContractIdsRef.current.has(id)
          )
        )
      );
      toast.success('Permissões de acesso copiadas. Salvamento automático em andamento.');
    } catch (error) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível copiar permissões de acesso.');
    } finally {
      setIsApplyingCopyGeneral(false);
    }
  };

  const handleCopyContractsFromUser = async () => {
    if (!copyFromUserIdContracts) return;
    if (!isPositionMode && copyFromUserIdContracts === userId) {
      toast('Selecione outro usuário para copiar.');
      return;
    }
    try {
      setIsApplyingCopyContracts(true);
      const source = await fetchSourceUserPermissions(copyFromUserIdContracts);
      if (!source) {
        toast.error('Não é possível copiar de usuário Administrador.');
        return;
      }
      const nextContract = new Set<ContractAction>();
      for (const p of source.permissions || []) {
        if (p.module !== CONTRACTS_MODULE_KEY) continue;
        if (CONTRACT_ACTIONS.includes(p.action as ContractAction)) {
          nextContract.add(p.action as ContractAction);
        }
      }
      const nextContractIds = new Set(source.allowedContractIds || []);
      const rawDp = new Set(source.dpApprovalContractIds || []);
      const nextDp = new Set(Array.from(rawDp).filter((id) => nextContractIds.has(id)));
      const sourceHasContractsModule = (source.permissions || []).some((p) => p.module === CONTRACTS_MODULE_KEY);
      const srcFlags = (source as UserPermissionPayload).contractModuleFlags ?? {};
      const defaultFlags: ContractModuleFlags = {
        orcamento: false,
        relatorios: false,
        ordemServico: false,
        producaoSemanal: false,
      };
      const nextFlags: Record<string, ContractModuleFlags> = {};
      for (const id of Array.from(nextContractIds)) {
        nextFlags[id] = srcFlags[id] ?? { ...defaultFlags };
      }
      setContractActionsSet(nextContract);
      setSelectedContractIds(nextContractIds);
      setSelectedDpApprovalContractIds(nextDp);
      setContractModuleFlags(nextFlags);
      setSelectedSet((prev) => {
        const next = new Set(prev);
        if (sourceHasContractsModule || nextContract.size > 0 || nextContractIds.size > 0) {
          next.add(CONTRACTS_MODULE_KEY);
        } else {
          next.delete(CONTRACTS_MODULE_KEY);
        }
        return next;
      });
      toast.success('Permissões de contratos copiadas. Salvamento automático em andamento.');
    } catch (error) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível copiar permissões de contratos.');
    } finally {
      setIsApplyingCopyContracts(false);
    }
  };

  const handleRestoreDefaults = () => {
    toast(
      'Padrões por cargo podem ser ajustados pelo administrador no cadastro de cargos ou no fluxo de permissões do funcionário, quando disponível.'
    );
  };

  const hasPendingChanges =
    baselineSerializedRef.current !== null &&
    serializeFullBaseline(
      selectedSet,
      contractActionsSet,
      selectedContractIds,
      employeeActionsSet,
      selectedDpApprovalContractIds,
      contractModuleFlags
    ) !== baselineSerializedRef.current;

  const handleBackWithSave = async () => {
    if (isSavingPermissions) return;
    if (!hasPendingChanges) {
      onBack();
      return;
    }
    try {
      await persistPermissionsAsync();
      onBack();
    } catch {
      // onError da mutation já exibe o toast.
    }
  };

  const contractsTabAvailable =
    selectedSet.has(CONTRACTS_MODULE_KEY) || contractActionsSet.size > 0 || selectedContractIds.size > 0;

  useEffect(() => {
    onContractsTabAvailabilityChange?.(contractsTabAvailable);
    if (!contractsTabAvailable && activeTab === 'contratos') {
      setActiveTab('gerais');
    }
  }, [contractsTabAvailable, activeTab, setActiveTab, onContractsTabAvailabilityChange]);

  if (loadingPermissions) {
    return <Loading message="Carregando permissões..." fullScreen={false} size="md" />;
  }

  if (permissionError) {
    return (
      <Card>
        <CardContent className="text-center">
          <p className="text-gray-700 dark:text-gray-300">
            Não foi possível carregar as permissões. Verifique se você é administrador e se o usuário existe.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Voltar
          </button>
        </CardContent>
      </Card>
    );
  }

  if (userPermissionData?.isAdmin) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Voltar para funcionários
        </button>
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Este usuário é Administrador e possui acesso total. Não é necessário configurar permissões.
            </span>
          </div>
        </div>
      </div>
    );
  }

  const displayName = userPermissionData?.user?.name ?? preview.name;
  const displayPosition =
    userPermissionData?.user?.employee?.position ?? preview.position ?? 'Sem cargo definido';

  const labelFor = (mod: PermissionModuleDef) => displayModuleName(mod);

  /** Em contratos, "Ver" representa o acesso ao módulo. */
  const contractVerChecked = selectedSet.has(CONTRACTS_MODULE_KEY) || contractActionsSet.has('ver');
  const employeeVerChecked = selectedSet.has(EMPLOYEES_MODULE_KEY) || employeeActionsSet.has('ver');

  const toggleContractVerCell = () => {
    const hasAnyContractsPermission =
      selectedSet.has(CONTRACTS_MODULE_KEY) || contractActionsSet.size > 0 || selectedContractIds.size > 0;

    if (hasAnyContractsPermission) {
      setSelectedSet((prev) => {
        const next = new Set(prev);
        next.delete(CONTRACTS_MODULE_KEY);
        return next;
      });
      setContractActionsSet(new Set());
      setSelectedContractIds(new Set());
      return;
    }

    setSelectedSet((prev) => {
      const next = new Set(prev);
      next.add(CONTRACTS_MODULE_KEY);
      return next;
    });
  };

  const toggleEmployeeVerCell = () => {
    const hasAny =
      selectedSet.has(EMPLOYEES_MODULE_KEY) || employeeActionsSet.size > 0;

    if (hasAny) {
      setSelectedSet((prev) => {
        const next = new Set(prev);
        next.delete(EMPLOYEES_MODULE_KEY);
        return next;
      });
      setEmployeeActionsSet(new Set());
      return;
    }

    setSelectedSet((prev) => {
      const next = new Set(prev);
      next.add(EMPLOYEES_MODULE_KEY);
      return next;
    });
  };

  const displayCategories =
    activeTab === 'controle' ? controleModulesByCategory : modulesByCategory;

  return (
    <div className="w-full space-y-0">
      {!hideTopNavigation && (
        <div className="mb-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleBackWithSave}
            className="inline-flex w-fit items-center gap-2 rounded-lg text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Voltar
          </button>
        </div>
      )}

      <Card className="relative w-full overflow-hidden border-gray-200/80 shadow-sm dark:border-gray-700/80" padding="none">
        {isSavingPermissions ? (
          <div
            className="pointer-events-none absolute right-4 top-3 z-10 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300"
            aria-live="polite"
          >
            Salvando...
          </div>
        ) : null}
        {/* Perfil */}
        <div className="border-b border-gray-200 bg-white px-4 py-5 dark:border-gray-700 dark:bg-gray-800 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-sm font-bold text-blue-600 dark:border-blue-400 dark:bg-gray-800 dark:text-blue-400">
                {displayName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{displayName}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="text-gray-700 dark:text-gray-300">{displayPosition}</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Restaurar padrões do cargo
              </button>
            </div>
          </div>
        </div>

        {!tabsControlled && (
          <UserPermissionsTabBar
            activeTab={activeTab}
            onChange={setActiveTab}
            showContracts={contractsTabAvailable}
            className="w-full bg-white px-4 pb-0 pt-2 dark:bg-gray-800 sm:px-6"
          />
        )}

        {activeTab === 'gerais' || activeTab === 'controle' ? (
          <div className="bg-white px-4 pb-6 dark:bg-gray-800 sm:px-6">
            {activeTab === 'gerais' && !isPositionMode && (
              <div className="border-b border-gray-100 py-4 dark:border-gray-700/70">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-medium text-gray-800 dark:text-gray-200">Copiar permissões de acesso</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Copia as permissões de acesso do usuário selecionado.
                    </p>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[560px]">
                    <div className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-center">
                      <UserSearchSelect
                        users={copyableUsers}
                        searchValue={copyGeneralSearch}
                        onSearchValueChange={setCopyGeneralSearch}
                        selectedUserId={copyFromUserIdGeneral}
                        onSelectUserId={setCopyFromUserIdGeneral}
                      />
                      <button
                        type="button"
                        onClick={handleCopyGeneralFromUser}
                        disabled={!copyFromUserIdGeneral || isApplyingCopyGeneral}
                        className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        {isApplyingCopyGeneral ? 'Copiando...' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'controle' && (
              <div className="border-b border-gray-100 py-4 dark:border-gray-700/70">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Ações administrativas que não são páginas do menu, como alterar permissões, auditoria, exportações e
                  criar solicitações restritas. Você pode restringir essas ações independentemente do acesso às telas.
                </p>
              </div>
            )}
            {displayCategories.length === 0 ? (
              <div className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum módulo disponível para configurar.
              </div>
            ) : (
              displayCategories.map(({ category, modules }) => (
                <div key={category} className="border-t border-gray-100 first:border-t-0 dark:border-gray-700/80">
                  <div className="overflow-x-auto pt-6 first:pt-4">
                    {activeTab === 'controle' ? (
                      <table className="w-full min-w-[320px] table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                            <th
                              scope="col"
                              className="w-[72%] pb-3 pl-1 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                            >
                              {category}
                            </th>
                            <th
                              scope="col"
                              className="w-[28%] px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                            >
                              Liberado
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                          {modules.map((mod) => {
                            const Icon = moduleIcon(mod.href);
                            const lbl = labelFor(mod);
                            const liberado = selectedSet.has(mod.key);
                            return (
                              <tr
                                key={mod.key}
                                className="transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/25"
                              >
                                <td className="py-3.5 pl-1 pr-4">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-500">
                                      <Icon className="h-4 w-4 stroke-[1.5]" aria-hidden />
                                    </div>
                                    <span className="min-w-0 font-medium leading-snug text-gray-900 dark:text-gray-100">
                                      {lbl}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-1 py-3.5 text-center align-middle">
                                  <div className="flex justify-center">
                                    <PermissionMatrixCheckbox
                                      checked={liberado}
                                      onCheckedChange={(next) => {
                                        if (next === liberado) return;
                                        toggleModule(mod.key);
                                      }}
                                      aria-label={`${lbl} — liberado`}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full min-w-[640px] table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                            <th
                              scope="col"
                              className="w-[42%] pb-3 pl-1 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                            >
                              {category}
                            </th>
                            {(['Ver', 'Criar', 'Editar', 'Excluir'] as const).map((h) => (
                              <th
                                key={h}
                                scope="col"
                                className="w-[14.5%] px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                          {modules.map((mod) => {
                            const Icon = moduleIcon(mod.href);
                            const lbl = labelFor(mod);
                            const isContracts = mod.key === CONTRACTS_MODULE_KEY;
                            const isEmployees = mod.key === EMPLOYEES_MODULE_KEY;
                            const granularRow = isContracts || isEmployees;
                            const verOn = isContracts
                              ? contractVerChecked
                              : isEmployees
                                ? employeeVerChecked
                                : selectedSet.has(mod.key);
                            return (
                              <tr
                                key={mod.key}
                                className="transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/25"
                              >
                                <td className="py-3.5 pl-1 pr-4">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-500">
                                      <Icon className="h-4 w-4 stroke-[1.5]" />
                                    </div>
                                    <span className="min-w-0 font-medium leading-snug text-gray-900 dark:text-gray-100">
                                      {lbl}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-1 py-3.5 text-center align-middle">
                                  <div className="flex justify-center">
                                    <PermissionMatrixCheckbox
                                      checked={verOn}
                                      onCheckedChange={(next) => {
                                        if (next === verOn) return;
                                        if (isContracts) toggleContractVerCell();
                                        else if (isEmployees) toggleEmployeeVerCell();
                                        else toggleModule(mod.key);
                                      }}
                                      aria-label={
                                        isContracts
                                          ? `Ver contratos — ${lbl}`
                                          : isEmployees
                                            ? `Ver funcionários — ${lbl}`
                                            : `Acesso a ${lbl}`
                                      }
                                    />
                                  </div>
                                </td>
                                {(['criar', 'editar', 'excluir'] as const).map((gran) => (
                                  <td key={gran} className="px-1 py-3.5 text-center align-middle">
                                    <div className="flex justify-center">
                                      <PermissionMatrixCheckbox
                                        disabled={!granularRow}
                                        checked={
                                          isContracts
                                            ? contractActionsSet.has(gran)
                                            : isEmployees
                                              ? employeeActionsSet.has(gran)
                                              : false
                                        }
                                        onCheckedChange={(next) => {
                                          if (!granularRow) return;
                                          if (isContracts) {
                                            if (next === contractActionsSet.has(gran)) return;
                                            toggleContractAction(gran);
                                          } else if (isEmployees) {
                                            if (next === employeeActionsSet.has(gran)) return;
                                            toggleEmployeeAction(gran);
                                          }
                                        }}
                                        aria-label={`${gran} — ${lbl}`}
                                      />
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-white px-4 pb-6 dark:bg-gray-800 sm:px-6">
            {!isPositionMode && (
              <div className="border-b border-gray-100 py-4 dark:border-gray-700/70">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-medium text-gray-800 dark:text-gray-200">Copiar permissões de contratos</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Copia ações de contratos, contratos liberados e coluna Gestor do usuário selecionado.
                    </p>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[560px]">
                    <div className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-center">
                      <UserSearchSelect
                        users={copyableUsers}
                        searchValue={copyContractsSearch}
                        onSearchValueChange={setCopyContractsSearch}
                        selectedUserId={copyFromUserIdContracts}
                        onSelectUserId={setCopyFromUserIdContracts}
                      />
                      <button
                        type="button"
                        onClick={handleCopyContractsFromUser}
                        disabled={!copyFromUserIdContracts || isApplyingCopyContracts}
                        className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        {isApplyingCopyContracts ? 'Copiando...' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!selectedSet.has(CONTRACTS_MODULE_KEY) ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Ative o módulo <strong>Contratos</strong> na aba <strong>Acesso</strong> (linha
                  Contratos, coluna Ver) para escolher contratos específicos.
                </p>
              </div>
            ) : contractsList.length === 0 ? (
              <div className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum contrato cadastrado ainda.
              </div>
            ) : (
              <div>
                <div className="max-h-[min(28rem,60vh)] overflow-x-auto overflow-y-auto pt-2 sm:pt-4">
                  <table className="w-full min-w-[760px] table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                        <th
                          scope="col"
                          className="w-[30%] pb-3 pl-1 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                        >
                          Contratos
                        </th>
                        <th
                          scope="col"
                          className="px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                        >
                          Liberado
                        </th>
                        <th
                          scope="col"
                          className="px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                          title="Aprovar solicitações ao DP, criar rescisão/alteração de função-salário neste contrato"
                        >
                          Gestor
                        </th>
                        <th
                          scope="col"
                          className="px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                          title="Acesso à aba Orçamento neste contrato"
                        >
                          Orçamento
                        </th>
                        <th
                          scope="col"
                          className="px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                          title="Acesso à aba Relatórios neste contrato"
                        >
                          Relatórios
                        </th>
                        <th
                          scope="col"
                          className="px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                          title="Acesso às Ordens de Serviço neste contrato"
                        >
                          O.S.
                        </th>
                        <th
                          scope="col"
                          className="px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                          title="Acesso à Produção Semanal neste contrato"
                        >
                          Prod. Sem.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {contractsList.map((c) => {
                        const liberado = selectedContractIds.has(c.id);
                        const gestorDp = selectedDpApprovalContractIds.has(c.id);
                        const flags = contractModuleFlags[c.id] ?? {
                          orcamento: false,
                          relatorios: false,
                          ordemServico: false,
                          producaoSemanal: false,
                        };
                        return (
                          <tr
                            key={c.id}
                            className="transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/25"
                          >
                            <td className="py-3.5 pl-1 pr-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-500">
                                  <FileText className="h-4 w-4 stroke-[1.5]" />
                                </div>
                                <span className="min-w-0 font-medium leading-snug text-gray-900 dark:text-gray-100">
                                  {c.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <PermissionMatrixCheckbox
                                  checked={liberado}
                                  onCheckedChange={(next) => {
                                    if (next !== liberado) toggleContract(c.id);
                                  }}
                                  aria-label={`Liberar contrato ${c.name}`}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <PermissionMatrixCheckbox
                                  checked={gestorDp}
                                  onCheckedChange={(next) => {
                                    if (next === gestorDp) return;
                                    if (next) {
                                      setSelectedContractIds((prev) => new Set(prev).add(c.id));
                                      setSelectedDpApprovalContractIds((prev) => new Set(prev).add(c.id));
                                    } else {
                                      setSelectedDpApprovalContractIds((prev) => {
                                        const n = new Set(prev);
                                        n.delete(c.id);
                                        return n;
                                      });
                                    }
                                  }}
                                  aria-label={`Gestor — ${c.name}`}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <PermissionMatrixCheckbox
                                  checked={flags.orcamento}
                                  onCheckedChange={(next) => setContractModuleFlag(c.id, 'orcamento', next)}
                                  aria-label={`Orçamento — ${c.name}`}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <PermissionMatrixCheckbox
                                  checked={flags.relatorios}
                                  onCheckedChange={(next) => setContractModuleFlag(c.id, 'relatorios', next)}
                                  aria-label={`Relatórios — ${c.name}`}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <PermissionMatrixCheckbox
                                  checked={flags.ordemServico}
                                  onCheckedChange={(next) => setContractModuleFlag(c.id, 'ordemServico', next)}
                                  aria-label={`Ordem de Serviço — ${c.name}`}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <PermissionMatrixCheckbox
                                  checked={flags.producaoSemanal}
                                  onCheckedChange={(next) => setContractModuleFlag(c.id, 'producaoSemanal', next)}
                                  aria-label={`Produção Semanal — ${c.name}`}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
