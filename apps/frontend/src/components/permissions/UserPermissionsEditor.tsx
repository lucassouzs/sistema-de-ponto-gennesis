'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Copy,
  FileText,
  LayoutDashboard,
  Layers,
  MoreVertical,
  RotateCcw,
  ShieldCheck,
  User,
  Wallet,
  HardHat,
  Package,
  FolderOpen,
  Clock,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import {
  PERMISSION_ACCESS_ACTION,
  PERMISSION_CONTROLE_CATEGORY,
  PERMISSION_CONTROLE_GROUP_ORDER,
  PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX,
  PERMISSION_MODULE_KEYS_OPEN_ACCESS,
  PERMISSION_MODULES,
  pathToModuleKey,
  type PermissionModuleDef,
} from '@sistema-ponto/permission-modules';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { isGennecyBotUser } from '@/lib/gennecyBot';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import api from '@/lib/api';

/** Orçamento e relatórios fotográficos: só pela aba «Contratos», não pela matriz «Acesso». */
const HIDDEN_FROM_ACCESS_MATRIX = new Set<string>([
  ...PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX,
  ...PERMISSION_MODULE_KEYS_OPEN_ACCESS,
  // Registros de Ponto: a página só aparece para funcionários com `requiresTimeClock`,
  // não é controlada pela matriz de permissões.
  pathToModuleKey('/ponto'),
]);

type PermissionItem = { module: string; action: string };

type ContractModuleFlags = {
  orcamento: boolean;
  relatorios: boolean;
  ordemServico: boolean;
  producaoSemanal: boolean;
};

type UserPermissionPayload = {
  user: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl?: string | null;
    employee?: { position?: string | null };
  };
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
  cpf?: string | null;
  profilePhotoUrl?: string | null;
  employee?: { position?: string; department?: string };
};

function formatPermissionUserCpf(cpf?: string | null) {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf?.trim() || '—';
}

export type PermissionsTargetPreview = {
  id: string;
  name: string;
  email: string;
  position?: string;
  profilePhotoUrl?: string | null;
};

function serializePermissionSet(s: Set<string>): string {
  return Array.from(s).sort().join('\u0000');
}

const CONTRACTS_MODULE_KEY = pathToModuleKey('/ponto/contratos');
const EMPLOYEES_MODULE_KEY = pathToModuleKey('/ponto/funcionarios');
/** Removido da UI (gestor por contrato na aba Contratos); ainda pode existir no banco até o próximo salvamento. */
const DEPRECATED_DP_APPROVE_CONTROLE_KEY = pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp');
const DEPRECATED_RM_APPROVE_CONTROLE_KEY = pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais');
const DEPRECATED_OC_GESTOR_APPROVE_CONTROLE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-gestor');

const DEPRECATED_CONTROLE_KEYS = new Set([
  DEPRECATED_DP_APPROVE_CONTROLE_KEY,
  DEPRECATED_RM_APPROVE_CONTROLE_KEY,
  DEPRECATED_OC_GESTOR_APPROVE_CONTROLE_KEY,
]);
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
    if (DEPRECATED_CONTROLE_KEYS.has(module)) continue;
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
  'Departamento Pessoal',
  'Financeiro',
  'Métricas',
  'Engenharia',
  'Contratos e Licitações',
  'Jurídico',
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
      '/ponto/painel-do-sistema',
      '/ponto/aprovacoes',
      '/ponto/financeiro/gestao-solicitacoes',
      '/ponto/solicitacoes-dp',
      '/ponto/drive',
      '/ponto/reserva-veiculos',
      '/ponto/solicitar-combustivel',
      '/ponto/entrega-logistica',
      '/ponto/central-de-ajuda',
    ].some((p) => h === p)
  ) {
    return 'Principal';
  }
  if (
    [
      '/ponto/funcionarios',
      '/ponto/folha-pagamento',
      '/ponto/atestados',
      '/ponto/gerenciar-atestados',
      '/ponto/solicitacoes',
      '/ponto/gerenciar-solicitacoes',
      '/ponto/gerenciar-solicitacoes-dp',
      '/ponto/conversas-whatsapp',
      '/ponto/suporte-ti',
      '/ponto/ferias',
      '/ponto/gerenciar-ferias',
      '/ponto/gerenciar-feriados',
      '/ponto/banco-horas',
      '/relatorios/alocacao',
      '/ponto/aniversariantes',
      '/ponto/seguranca-do-trabalho',
    ].some((p) => h === p)
  ) {
    return 'Departamento Pessoal';
  }
  if (
    h === '/ponto/financeiro/analise-extrato' ||
    h === '/ponto/financeiro/controle-nfs' ||
    h === '/ponto/financeiro/nfs-recebidas' ||
    h === '/ponto/contratos/controle-geral' ||
    h === '/ponto/contratos/socios' ||
    h === '/ponto/contratos/gastos-operacionais'
  ) {
    return 'Métricas';
  }
  if (h.startsWith('/ponto/financeiro')) return 'Financeiro';
  if (
    [
      '/ponto/orcamento',
      '/ponto/contratos',
      '/ponto/contratos/relatorios',
      '/ponto/andamento-da-os',
      '/ponto/sistema-gestao-os',
      '/ponto/pleitos-gerados',
      '/ponto/aprovacao-fds',
      '/ponto/recebimento-entregas',
      '/ponto/solicitar-materiais',
      '/ponto/solicitar-ferramentas',
    ].some((p) => h === p)
  ) {
    return 'Engenharia';
  }
  if (
    h === '/ponto/espelho-nf' ||
    h === '/ponto/licitacoes' ||
    h === '/ponto/licitacoes-pncp' ||
    h === '/ponto/contratos/medicao' ||
    h === '/ponto/responsaveis-tecnicos' ||
    h === '/ponto/controle-anuidade' ||
    h === '/ponto/controle-pagamentos-art'
  ) {
    return 'Contratos e Licitações';
  }
  if (h === '/ponto/juridico/processos-ativos') return 'Jurídico';
  if (
    [
      '/ponto/gerenciar-materiais',
      '/ponto/mapa-cotacao',
      '/ponto/ordem-de-compra',
      '/ponto/estoque',
      '/ponto/furo-estoque',
      '/ponto/ajuste-estoque',
      '/ponto/controle-entregas',
      '/ponto/entregas-logistica',
      '/ponto/fds-aprovadas',
      '/ponto/solicitacoes-combustivel',
      '/ponto/solicitacoes-reserva-veiculos',
      '/ponto/solicitacoes-ferramentas',
    ].some((p) => h === p)
  ) {
    return 'Suprimentos';
  }
  if (
    [
      '/ponto/centros-custo',
      '/ponto/materiais-construcao',
      '/ponto/fornecedores',
      '/ponto/veiculos',
      '/ponto/regioes-postos-combustivel',
      '/ponto/condicoes-pagamento',
      '/ponto/natureza-orcamentaria',
      '/ponto/formularios',
      '/ponto/prestadores-servico',
      '/ponto/tomadores-servico',
      '/ponto/contas-bancarias',
      '/ponto/codigos-tributarios',
      '/ponto/sistema-gestao-os/locais',
      '/ponto/sistema-gestao-os/equipamentos',
      '/ponto/sistema-gestao-os/tipos-servico',
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
  const raw = c || inferCategoryFromHref(m.href);
  if (raw === 'Contrações e Licitações' || raw === 'Contratações e Licitações') {
    return 'Contratos e Licitações';
  }
  if (raw === 'Controle CREA') {
    return 'Contratos e Licitações';
  }
  return raw;
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
  if (href.startsWith('/ponto/controle')) return Settings;
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
    { id: 'gerais' as const, label: 'Acesso', disabled: false as const },
    { id: 'contratos' as const, label: 'Contratos', disabled: !showContracts },
    { id: 'controle' as const, label: 'Controle', disabled: false as const },
  ];

  return (
    <div className={className}>
      <AppUnderlineTabList aria-label="Abas de permissões" centered={false}>
        {items.map((t) => {
          const isActive = !t.disabled && activeTab === t.id;
          return (
            <AppUnderlineTabButton
              key={t.id}
              active={isActive}
              onClick={() => {
                if (!t.disabled) onChange(t.id);
              }}
              disabled={t.disabled}
              aria-disabled={t.disabled}
              title={t.disabled ? 'Ative o módulo Contratos na aba Acesso' : undefined}
              className="px-3 py-2 text-sm"
            >
              {t.label}
            </AppUnderlineTabButton>
          );
        })}
      </AppUnderlineTabList>
    </div>
  );
}

function PermissionPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center space-x-3">
        <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
          <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        </div>
      </div>
      {actions ? (
        <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
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
  preview: _preview,
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
  const [permissionActionModal, setPermissionActionModal] = useState<'menu' | 'copy' | 'restore' | null>(
    null
  );
  const [copyModalUserId, setCopyModalUserId] = useState('');
  const [isApplyingCopy, setIsApplyingCopy] = useState(false);
  const [isRestoringDefaults, setIsRestoringDefaults] = useState(false);
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
  /** Evita PUTs concorrentes (causa 409 na unique userId+module+action). */
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);

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
    enabled:
      (isPositionMode || !!userId) &&
      !!userPermissionData &&
      !userPermissionData.isAdmin &&
      activeTab === 'contratos',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [loadCopyUsers, setLoadCopyUsers] = useState(false);
  const { data: permissionUsers = [] } = useQuery({
    queryKey: ['permission-users'],
    queryFn: async () => (await api.get('/permissions/users')).data?.data as PermissionUserListItem[],
    enabled: !isPositionMode && !!userId && loadCopyUsers,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const copyableUsers = useMemo(
    () =>
      permissionUsers.filter((u) => {
        if (u.id === userId) return false;
        if (isGennecyBotUser(u)) return false;
        const position = (u.employee?.position || '').trim().toLowerCase();
        const name = (u.name || '').trim().toLowerCase();
        return position !== 'administrador' && name !== 'administrador';
      }),
    [permissionUsers, userId]
  );

  const copyUserSelectOptions = useMemo(
    () =>
      copyableUsers.map((u) => {
        const initials = u.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const cpfLabel = formatPermissionUserCpf(u.cpf);
        return {
          value: u.id,
          label: u.name,
          description: cpfLabel,
          searchText: `${u.name} ${u.cpf || ''} ${cpfLabel}`,
          avatarUrl: resolveApiMediaUrl(u.profilePhotoUrl ?? null),
          avatarFallback: initials || '?',
        };
      }),
    [copyableUsers]
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
    DEPRECATED_CONTROLE_KEYS.forEach((k) => next.delete(k));
    PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX.forEach((k) => next.delete(k));
    PERMISSION_MODULE_KEYS_OPEN_ACCESS.forEach((k) => next.delete(k));
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

      const basePermissions = Array.from(currentSelected)
        .filter((module) => !DEPRECATED_CONTROLE_KEYS.has(module))
        .map((module) => ({ module }));
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

  const enqueuePersistPermissions = useCallback(() => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    void (async () => {
      try {
        do {
          saveQueuedRef.current = false;
          await persistPermissionsAsync();
        } while (saveQueuedRef.current);
      } catch {
        /* onError do mutation já exibe toast */
      } finally {
        saveInFlightRef.current = false;
      }
    })();
  }, [persistPermissionsAsync]);

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
      enqueuePersistPermissions();
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
    enqueuePersistPermissions,
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
      enqueuePersistPermissions();
    };
  }, [enqueuePersistPermissions]);

  const modulesByCategory = useMemo(() => {
    const byName = (a: PermissionModuleDef, b: PermissionModuleDef) =>
      displayModuleName(a).localeCompare(displayModuleName(b), 'pt-BR', { sensitivity: 'base' });
    const map = new Map<string, PermissionModuleDef[]>();
    for (const m of PERMISSION_MODULES) {
      const cat = moduleCategory(m);
      if (cat === PERMISSION_CONTROLE_CATEGORY) continue;
      if (HIDDEN_FROM_ACCESS_MATRIX.has(m.key)) continue;
      const list = map.get(cat) ?? [];
      list.push(m);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      modules: [...(map.get(c) ?? [])].sort(byName),
    }));
  }, []);

  const controleModulesByGroup = useMemo(() => {
    const byName = (a: PermissionModuleDef, b: PermissionModuleDef) =>
      displayModuleName(a).localeCompare(displayModuleName(b), 'pt-BR', { sensitivity: 'base' });
    const map = new Map<string, PermissionModuleDef[]>();
    for (const m of PERMISSION_MODULES) {
      const cat = moduleCategory(m);
      if (cat !== PERMISSION_CONTROLE_CATEGORY) continue;
      if (DEPRECATED_CONTROLE_KEYS.has(m.key)) continue;
      const group = (m as PermissionModuleDef).group?.trim() || 'Geral';
      const list = map.get(group) ?? [];
      list.push(m);
      map.set(group, list);
    }
    const ordered = PERMISSION_CONTROLE_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      modules: [...(map.get(g) ?? [])].sort(byName),
    }));
    const extras = [...map.keys()]
      .filter((g) => !(PERMISSION_CONTROLE_GROUP_ORDER as readonly string[]).includes(g))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((g) => ({ group: g, modules: [...(map.get(g) ?? [])].sort(byName) }));
    return [...ordered, ...extras];
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

  const closePermissionActionModal = () => {
    setPermissionActionModal(null);
    setCopyModalUserId('');
  };

  const openPermissionActionsMenu = () => {
    setPermissionActionModal('menu');
  };

  const applyPermissionsPayload = (source: {
    permissions: PermissionItem[];
    allowedContractIds?: string[];
    dpApprovalContractIds?: string[];
    contractModuleFlags?: Record<string, ContractModuleFlags>;
  }) => {
    const perms = source.permissions ?? [];
    const next = new Set<string>(
      perms.filter((p) => p.action === PERMISSION_ACCESS_ACTION).map((p) => p.module)
    );
    DEPRECATED_CONTROLE_KEYS.forEach((k) => next.delete(k));
    PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX.forEach((k) => next.delete(k));
    PERMISSION_MODULE_KEYS_OPEN_ACCESS.forEach((k) => next.delete(k));
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
    const nextContractIds = new Set(source.allowedContractIds ?? []);
    const rawDp = new Set(source.dpApprovalContractIds ?? []);
    const nextDpApproval = new Set(Array.from(rawDp).filter((id) => nextContractIds.has(id)));
    const rawFlags = source.contractModuleFlags ?? {};
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
  };

  const copyGeneralFromUser = async (sourceUserId: string) => {
    if (!sourceUserId) return;
    if (!isPositionMode && sourceUserId === userId) {
      toast('Selecione outro usuário para copiar.');
      return;
    }
    const source = await fetchSourceUserPermissions(sourceUserId);
    if (!source) {
      toast.error('Não é possível copiar de usuário Administrador.');
      return;
    }
    const nextGeneral = new Set<string>(
      (source.permissions || [])
        .filter((p) => p.action === PERMISSION_ACCESS_ACTION)
        .map((p) => p.module)
    );
    DEPRECATED_CONTROLE_KEYS.forEach((k) => nextGeneral.delete(k));
    PERMISSION_MODULE_KEYS_MANAGED_ONLY_ON_CONTRACT_MATRIX.forEach((k) => nextGeneral.delete(k));
    PERMISSION_MODULE_KEYS_OPEN_ACCESS.forEach((k) => nextGeneral.delete(k));
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
  };

  const copyContractsFromUser = async (sourceUserId: string) => {
    if (!sourceUserId) return;
    if (!isPositionMode && sourceUserId === userId) {
      toast('Selecione outro usuário para copiar.');
      return;
    }
    const source = await fetchSourceUserPermissions(sourceUserId);
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
    const srcFlags = source.contractModuleFlags ?? {};
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
  };

  const handleConfirmCopyFromUser = async () => {
    if (!copyModalUserId) return;
    try {
      setIsApplyingCopy(true);
      if (activeTab === 'contratos') {
        await copyContractsFromUser(copyModalUserId);
      } else {
        await copyGeneralFromUser(copyModalUserId);
      }
      closePermissionActionModal();
    } catch (error) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível copiar permissões.');
    } finally {
      setIsApplyingCopy(false);
    }
  };

  const handleRestoreDefaults = async () => {
    const position = (userPermissionData?.user?.employee?.position ?? _preview.position ?? '').trim();
    if (!position) {
      toast.error('Este funcionário não possui cargo definido.');
      return;
    }
    try {
      setIsRestoringDefaults(true);
      const res = await api.get('/permissions/position-template', { params: { position } });
      const data = res.data?.data as {
        permissions?: PermissionItem[];
        allowedContractIds?: string[];
        dpApprovalContractIds?: string[];
        contractModuleFlags?: Record<string, ContractModuleFlags>;
      };
      applyPermissionsPayload({
        permissions: data?.permissions ?? [],
        allowedContractIds: data?.allowedContractIds ?? [],
        dpApprovalContractIds: data?.dpApprovalContractIds ?? [],
        contractModuleFlags: data?.contractModuleFlags ?? {},
      });
      toast.success('Padrões do cargo restaurados. Salvamento automático em andamento.');
      closePermissionActionModal();
    } catch (error) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível restaurar os padrões do cargo.');
    } finally {
      setIsRestoringDefaults(false);
    }
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
    activeTab === 'controle'
      ? controleModulesByGroup.map(({ group, modules }) => ({ category: group, modules }))
      : modulesByCategory;

  const employeePosition = (userPermissionData?.user?.employee?.position ?? _preview.position ?? '').trim();

  const permissionActionsButton = !isPositionMode ? (
    <button
      type="button"
      onClick={openPermissionActionsMenu}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      aria-label="Ações"
      title="Ações"
    >
      <MoreVertical className="h-5 w-5" aria-hidden />
    </button>
  ) : undefined;

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

      <Card className="relative w-full overflow-hidden border-gray-200/80 shadow-sm dark:border-gray-700/80">
        {isSavingPermissions ? (
          <div
            className="pointer-events-none absolute right-4 top-3 z-10 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300"
            aria-live="polite"
          >
            Salvando...
          </div>
        ) : null}

        {!tabsControlled && (
          <UserPermissionsTabBar
            activeTab={activeTab}
            onChange={setActiveTab}
            showContracts={contractsTabAvailable}
            className="mb-2 w-full"
          />
        )}

        {activeTab === 'gerais' || activeTab === 'controle' ? (
          <>
            <CardHeader className="!border-b-0 pb-1">
              <PermissionPageHeader
                icon={activeTab === 'controle' ? Settings : ShieldCheck}
                title={activeTab === 'controle' ? 'Controle' : 'Acesso'}
                subtitle={
                  activeTab === 'controle'
                    ? 'Ações administrativas que não aparecem no menu.'
                    : 'Defina quais módulos e ações este usuário pode usar.'
                }
                actions={activeTab === 'gerais' ? permissionActionsButton : undefined}
              />
            </CardHeader>
            <CardContent className="space-y-5">
            {displayCategories.length === 0 ? (
              <div className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum módulo disponível para configurar.
              </div>
            ) : (
              displayCategories.map(({ category, modules }) => (
                <div key={category} className="pt-5 first:pt-0">
                  <div className="overflow-x-auto overscroll-x-contain">
                    {activeTab === 'controle' ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                            <th
                              scope="col"
                              className="pb-3 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                            >
                              {category}
                            </th>
                            <th
                              scope="col"
                              className="w-28 pb-3 pl-4 pr-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
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
                                <td className="py-3.5 pr-4">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-500">
                                      <Icon className="h-4 w-4 stroke-[1.5]" aria-hidden />
                                    </div>
                                    <span className="min-w-0 font-medium leading-snug text-gray-900 dark:text-gray-100">
                                      {lbl}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 pl-4 pr-2 text-right align-middle">
                                  <div className="inline-flex justify-end">
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
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                            <th
                              scope="col"
                              className="pb-3 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                            >
                              {category}
                            </th>
                            {(['Ver', 'Criar', 'Editar', 'Excluir'] as const).map((h) => (
                              <th
                                key={h}
                                scope="col"
                                className="w-32 px-3 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
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
                                <td className="py-3.5 pr-4">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-500">
                                      <Icon className="h-4 w-4 stroke-[1.5]" />
                                    </div>
                                    <span className="min-w-0 font-medium leading-snug text-gray-900 dark:text-gray-100">
                                      {lbl}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-center align-middle">
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
                                  <td key={gran} className="px-3 py-3.5 text-center align-middle">
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
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="!border-b-0 pb-1">
              <PermissionPageHeader
                icon={FileText}
                title="Contratos"
                subtitle="Libere contratos e recursos específicos para este usuário."
                actions={permissionActionsButton}
              />
            </CardHeader>
            <CardContent>
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
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                        <th
                          scope="col"
                          className="pb-3 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
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
                          title="Gestor do contrato: aprova solicitações DP/FD, requisições de materiais e OCs na fase gestor deste contrato"
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
                            <td className="py-3.5 pr-4">
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
            </CardContent>
          </>
        )}
      </Card>

      <Modal
        isOpen={permissionActionModal === 'menu'}
        onClose={closePermissionActionModal}
        title="Permissões"
        size="sm"
      >
        <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">
          Escolha como deseja alterar as permissões deste usuário.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setLoadCopyUsers(true);
              setPermissionActionModal('copy');
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 dark:hover:bg-red-500"
          >
            <Copy className="h-4 w-4 shrink-0" aria-hidden />
            Copiar de outro usuário
          </button>
          <button
            type="button"
            onClick={() => setPermissionActionModal('restore')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
            Restaurar padrões do cargo
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={permissionActionModal === 'copy'}
        onClose={closePermissionActionModal}
        title="Copiar permissões"
        size="sm"
        contentOverflowVisible
      >
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {activeTab === 'contratos'
            ? 'Copia ações, contratos liberados e coluna Gestor de outro usuário.'
            : 'Copia as permissões de acesso e controle de outro usuário.'}
        </p>
        <StringSingleSelectDropdown
          value={copyModalUserId || undefined}
          onChange={(id) => {
            setLoadCopyUsers(true);
            setCopyModalUserId(id);
          }}
          options={copyUserSelectOptions}
          placeholder="Selecionar usuário..."
          searchPlaceholder="Pesquisar funcionário..."
          emptyOptionsMessage={loadCopyUsers ? 'Nenhum funcionário encontrado.' : 'Carregando usuários...'}
          allowEmpty={false}
          matchTriggerWidth
          className="w-full"
        />
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setPermissionActionModal('menu')}
            disabled={isApplyingCopy}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirmCopyFromUser}
            disabled={!copyModalUserId || isApplyingCopy}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500"
          >
            {isApplyingCopy ? 'Copiando...' : 'Confirmar cópia'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={permissionActionModal === 'restore'}
        onClose={closePermissionActionModal}
        confirmBeforeClose={false}
        title="Restaurar padrões do cargo"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {employeePosition ? (
            <>
              As permissões atuais serão substituídas pelo template do cargo{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">{employeePosition}</span>.
            </>
          ) : (
            'Este funcionário não possui cargo definido. Defina o cargo antes de restaurar os padrões.'
          )}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setPermissionActionModal('menu')}
            disabled={isRestoringDefaults}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            disabled={!employeePosition || isRestoringDefaults}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500"
          >
            {isRestoringDefaults ? 'Restaurando...' : 'Restaurar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
