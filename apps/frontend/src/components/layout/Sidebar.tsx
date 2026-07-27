'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import { buildFluigApproversNavHref } from '@/lib/fluigWorkflowApproval';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

const FLUIG_APPROVAL_DATASET_IDS = [
  'Processos_Workflow_Aprovacao_G3',
  'Processos_Workflow_Aprovacao_G5',
];
const FLUIG_PREFETCH_HREFS = new Set([
  '/ponto/fluig/aprovacoes-workflow',
  '/ponto/fluig/aprovadores',
]);
import { CircularPhotoCropModal } from '@/components/conversas/CircularPhotoCropModal';
import { 
  Home, 
  Users, 
  Clock, 
  LogOut, 
  Menu, 
  X,
  User,
  ArrowLeftToLine,
  Lock,
  Settings,
  FolderClock,
  ImagePlus,
  CalendarDays,
  FileSpreadsheet,
  BookText,
  BookPlus,
  BookImage,
  BarChart3,
  FileText,
  Search,
  LayoutDashboard,
  Wallet,
  CalendarX2,
  MailPlus,
  Moon,
  Sun,
  AlertCircle,
  MessageSquare,
  MessagesSquare,
  FileCheck,
  DollarSign,
  CircleDollarSign,
  Package,
  PackageCheck,
  PackageX,
  Warehouse,
  ShoppingCart,
  Building2,
  Cake,
  DraftingCompass,
  Database,
  ClipboardList,
  ClipboardCheck,
  BadgeCheck,
  CreditCard,
  HardDrive,
  SquareKanban,
  Truck,
  Landmark,
  Percent,
  Contact,
  Scale,
  ScrollText,
  Camera,
  Loader2,
  Fuel,
  Car,
  CalendarRange,
  Workflow,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import { useFdNotificationCounts } from '@/hooks/useFdNotificationCounts';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import {
  isHomeRoute,
  isRailFooterRoute,
  readSelectedModuleId,
  readSidebarCollapsed,
  SIDEBAR_TRANSITION_CLASS,
  writeSelectedModuleId,
  writeSidebarCollapsed,
} from '@/lib/sidebarStorage';

const pk = pathToModuleKey;
import { useBrandingLogo } from '@/hooks/useBrandingLogo';
import { useTheme } from '@/context/ThemeContext';

interface SidebarProps {
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
  onMenuToggle?: (collapsed: boolean) => void;
  onOpenChangePassword?: () => void;
}

function SidebarRailTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
    setVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        className="relative flex justify-center"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocusCapture={showTooltip}
        onBlurCapture={hideTooltip}
      >
        {children}
      </div>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translateY(-50%)',
              zIndex: 9999,
            }}
            className="pointer-events-none max-w-[14rem] whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  );
}

export function Sidebar({ userRole, userName, onLogout, onMenuToggle, onOpenChangePassword }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsedState] = useState(false);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsCollapsedState(collapsed);
      onMenuToggle?.(collapsed);
    },
    [onMenuToggle]
  );
  const [selectedModuleId, setSelectedModuleId] = useState('main');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({});
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const pathname = usePathname();
  /** true quando o usuário clicou num módulo no rail sem mudar de rota */
  const userPickedModuleRef = useRef(false);
  const prevPathnameRef = useRef(pathname);
  const router = useRouter();
  const {
    permissions,
    isLoading,
    userPosition,
    user,
    isDepartmentPessoal,
    isDepartmentProjetos,
    userDepartment,
    can,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveOc,
    canApproveFuel,
    canApproveMaterialRequests,
    canAccessOsRoutePage,
    canAccessRecebimentoEntregasRoutePage,
    fluigApproverNameKeys,
    fluigApproverFullAccess,
    canAccessFluigApproversRoute,
  } = usePermissions();
  const { theme, toggleTheme, isDark } = useTheme();
  const { logoSrc, logoAlt } = useBrandingLogo();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarSectionRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Em dev, o Next compila cada rota ao fazer prefetch dos <Link> visíveis. Com um menu
  // grande, isso satura o compilador (single-thread) e o clique de navegação fica preso
  // na fila de compilações, dando a sensação de "página travada". Desativamos o prefetch
  // apenas em desenvolvimento; em produção ele continua ativo (rotas já pré-compiladas).
  const navLinkPrefetch = process.env.NODE_ENV === 'production' ? undefined : false;

  const prefetchFluigDatasets = useCallback(() => {
    router.prefetch('/ponto/fluig/aprovacoes-workflow');
    router.prefetch(
      buildFluigApproversNavHref({
        fullAccess: fluigApproverFullAccess,
        nameKeys: fluigApproverNameKeys,
      })
    );
    for (const id of FLUIG_APPROVAL_DATASET_IDS) {
      void queryClient.prefetchQuery({
        queryKey: ['fluig-workflow-approval', id],
        queryFn: async () => {
          const res = await api.post(
            `/fluig/datasets/${encodeURIComponent(id)}/data`,
            {},
            { timeout: 130000 }
          );
          return res.data;
        },
        staleTime: 7 * 60 * 1000,
      });
    }
  }, [queryClient, router, fluigApproverFullAccess, fluigApproverNameKeys]);

  // Prefetch automático: pré-carrega rotas e dados Fluig assim que o usuário faz login.
  useEffect(() => {
    if (!user || isLoading) return;

    const fluigApproversHref = buildFluigApproversNavHref({
      fullAccess: fluigApproverFullAccess,
      nameKeys: fluigApproverNameKeys,
    });

    const timer = setTimeout(() => {
      router.prefetch('/ponto/fluig/aprovacoes-workflow');
      router.prefetch(fluigApproversHref);

      if (canAccessFluigApproversRoute) {
        for (const id of FLUIG_APPROVAL_DATASET_IDS) {
          void queryClient.prefetchQuery({
            queryKey: ['fluig-workflow-approval', id],
            queryFn: async () => {
              const res = await api.post(
                `/fluig/datasets/${encodeURIComponent(id)}/data`,
                {},
                { timeout: 130000 }
              );
              return res.data;
            },
            staleTime: 7 * 60 * 1000,
          });
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    user,
    isLoading,
    router,
    queryClient,
    fluigApproverFullAccess,
    fluigApproverNameKeys,
    canAccessFluigApproversRoute,
  ]);
  const [profileAvatarMenu, setProfileAvatarMenu] = useState(false);
  const [profileCropSrc, setProfileCropSrc] = useState<string | null>(null);

  const { data: chatUnreadCount = 0 } = useQuery({
    queryKey: ['chat-unread-count', user?.id],
    queryFn: async () => {
      const res = await api.get('/chats/direct/unread/count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: () => {
      if (typeof document === 'undefined') return 30_000;
      return document.hidden ? false : 30_000;
    },
  });
  
  // Verificar se é administrador
  const isAdministrator = userPosition === 'Administrador';
  const isDepartmentCompras = userDepartment?.toLowerCase().includes('compras');
  const canSeeFuroEstoque =
    isAdministrator || isDepartmentCompras || can(pk('/ponto/furo-estoque'));
  const canSeeFuelSupplies =
    isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-combustivel'));
  const canSeeVehicleReservationSupplies =
    isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-reserva-veiculos'));
  const canSeeEntregaLogistica =
    isAdministrator || can(pk('/ponto/entrega-logistica'));

  const { data: pendingFuroCount = 0 } = useQuery({
    queryKey: ['stock-shortfalls-pending-count'],
    queryFn: async () => {
      const res = await api.get('/stock/shortfalls/pending-count');
      const n = Number(res.data?.count ?? res.data?.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeFuroEstoque && !isLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000
  });

  const { data: recebimentoPendingCount = 0 } = useQuery({
    queryKey: ['material-deliveries-recebimento-pending-count'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary', {
        params: { forRecebimento: 'true' },
      });
      const n = Number(res.data?.data?.awaitingEngineering ?? 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canAccessRecebimentoEntregasRoutePage && !isLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: fuelSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['fuel-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeFuelSupplies && !isLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: vehicleReservationSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['vehicle-reservation-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeVehicleReservationSupplies && !isLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: entregaLogisticaPendingCount = 0 } = useQuery({
    queryKey: ['logistics-delivery-pending-count'],
    queryFn: async () => {
      const res = await api.get('/logistics-delivery-requests/pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeEntregaLogistica && !isLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { counts: fdNotificationCounts } = useFdNotificationCounts();
  const { counts: approvalCounts } = useApprovalNotificationCounts();

  const navBadgeCountForHref = (href: string): number => {
    if (href === '/ponto/aprovacoes') return approvalCounts.total;
    if (href === '/ponto/gerenciar-materiais' && canApproveMaterialRequests) {
      return approvalCounts.rm;
    }
    if (href === '/ponto/fds-aprovadas') return fdNotificationCounts.pendingPurchase;
    if (href === '/ponto/furo-estoque') return pendingFuroCount;
    if (href === '/ponto/recebimento-entregas') return recebimentoPendingCount;
    if (href === '/ponto/solicitacoes-combustivel') return fuelSuppliesPendingCount;
    if (href === '/ponto/solicitacoes-reserva-veiculos') return vehicleReservationSuppliesPendingCount;
    if (href === '/ponto/entrega-logistica') return entregaLogisticaPendingCount;
    return 0;
  };

  type SidebarNavLeaf = {
    name: string;
    href: string;
    icon?: LucideIcon;
    description?: string;
    permission: boolean;
  };

  type SidebarNavItem = Omit<SidebarNavLeaf, 'icon'> & {
    icon: LucideIcon;
    /** Subpáginas (ex.: Controle CREA). */
    children?: SidebarNavLeaf[];
  };

  const navItemIsVisible = (item: SidebarNavItem): boolean => {
    if (item.children?.length) {
      return item.children.some((child) => child.permission);
    }
    return item.permission;
  };

  const navItemHasActiveChild = (item: SidebarNavItem): boolean =>
    Boolean(item.children?.some((child) => child.permission && isActive(child.href)));

  const navItemMatchesSearch = (item: SidebarNavItem, searchLower: string): boolean => {
    const selfMatch =
      item.name.toLowerCase().includes(searchLower) ||
      Boolean(item.description?.toLowerCase().includes(searchLower));
    if (selfMatch) return true;
    return Boolean(
      item.children?.some(
        (child) =>
          child.permission &&
          (child.name.toLowerCase().includes(searchLower) ||
            Boolean(child.description?.toLowerCase().includes(searchLower))),
      ),
    );
  };

  /** Soma só badges das páginas que a pessoa realmente vê nesse módulo. */
  const moduleBadgeCountForVisibleItems = (items: SidebarNavItem[]): number =>
    items.filter(navItemIsVisible).reduce((sum, item) => {
      if (item.children?.length) {
        return (
          sum +
          item.children
            .filter((child) => child.permission)
            .reduce((childSum, child) => childSum + navBadgeCountForHref(child.href), 0)
        );
      }
      return sum + navBadgeCountForHref(item.href);
    }, 0);

  // Verificar se o funcionário precisa bater ponto
  const requiresTimeClock = user?.employee?.requiresTimeClock !== false;
  
  // Verificar se é do departamento Financeiro
  const isDepartmentFinanceiro = userDepartment?.toLowerCase().includes('financeiro');

  // Verificar se é do departamento Jurídico
  const isDepartmentJuridico = userDepartment?.toLowerCase().includes('jurídico') ||
    userDepartment?.toLowerCase().includes('juridico');

  const handleLogout = () => {
    setProfileAvatarMenu(false);
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const handleCancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const uploadProfilePhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('profileAvatar', file);
      await api.patch('/auth/me/photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Foto de perfil atualizada');
      setProfileCropSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    onError: () => toast.error('Não foi possível atualizar a foto'),
  });

  const removeProfilePhotoMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/auth/me/photo');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Foto removida');
      setProfileAvatarMenu(false);
    },
    onError: () => toast.error('Não foi possível remover a foto'),
  });

  const profilePhotoHref = resolveApiMediaUrl(user?.profilePhotoUrl ?? null);

  // Fechar menu quando clicar fora dele
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (profileAvatarSectionRef.current?.contains(t)) return;
      setProfileAvatarMenu(false);
    };

    if (profileAvatarMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileAvatarMenu]);

  const isEmployee = userRole === 'EMPLOYEE';

  // Função para extrair iniciais do nome do usuário (primeiro e segundo nome)
  const getInitials = (name: string | undefined | null) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Menu items agrupados por categoria
  const getMenuItems = () => {
    const menuCategories = [
      {
        id: 'main',
        name: 'Principal',
        icon: Home,
        items: [
          {
            name: 'Dashboard',
            href: '/ponto/dashboard',
            icon: LayoutDashboard,
            description: 'Visão geral do sistema',
            permission: isAdministrator || isDepartmentPessoal || permissions.canViewDashboard
          },
          {
            name: 'Fluig - Processos',
            href: '/ponto/financeiro/gestao-solicitacoes',
            icon: BarChart3,
            description: 'Solicitações do Fluig na visão financeira',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/gestao-solicitacoes'))
          },
          {
            name: 'Fluig - Aprovações',
            href: '/ponto/fluig/aprovacoes-workflow',
            icon: FileCheck,
            description: 'Status de aprovação Compras, Gestor e Diretoria (G3/G5)',
            permission:
              isAdministrator ||
              isDepartmentFinanceiro ||
              isDepartmentCompras ||
              can(pk('/ponto/fluig/aprovacoes-workflow'))
          },
          {
            name: 'Aprovadores',
            href: '/ponto/fluig/aprovadores',
            icon: Users,
            description: 'Aprovações e pendências por pessoa (G3/G5)',
            permission:
              isAdministrator ||
              can(pk('/ponto/controle/gerenciar-aprovadores-fluig')) ||
              fluigApproverNameKeys.length > 0
          },
          {
            name: 'Aprovações',
            href: '/ponto/aprovacoes',
            icon: FileCheck,
            description: 'Caixa de entrada de aprovações',
            // Aparece automaticamente para quem é gestor (decide Solicitações Gerais)
            // ou tem a permissão «Aprovar Espelho da Nota Fiscal» (Controle).
            permission:
              canAccessDpApproverPages ||
              canApproveEspelhoNf ||
              canApproveOc ||
              canApproveFuel ||
              canApproveMaterialRequests,
          },
          {
            name: 'Solicitações DP/ADM/TST',
            href: '/ponto/solicitacoes-gerais',
            icon: MailPlus,
            description: 'Minhas solicitações ao DP',
            permission: isAdministrator || can(pk('/ponto/solicitacoes-dp'))
          },
          {
            name: 'Reserva de Veículos',
            href: '/ponto/reserva-veiculos',
            icon: Car,
            description: 'Solicitar reserva de veículos da frota',
            permission:
              isAdministrator || isDepartmentCompras || can(pk('/ponto/reserva-veiculos'))
          },
          {
            name: 'Entrega da Logística',
            href: '/ponto/entrega-logistica',
            icon: Truck,
            description: 'Finalizar solicitações de entrega logística',
            permission: isAdministrator || can(pk('/ponto/entrega-logistica'))
          },
        ]
      },
      {
        id: 'departamento-pessoal',
        name: 'Departamento Pessoal',
        icon: Users,
        items: [
          {
            name: 'Funcionários',
            href: '/ponto/funcionarios',
            icon: Users,
            description: 'Cadastrar e gerenciar funcionários',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageEmployees
          },
          {
            name: 'Folha de Pagamento',
            href: '/ponto/folha-pagamento',
            icon: FileSpreadsheet,
            description: 'Gestão de folha de pagamento',
            permission: isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll
          },
          {
            name: 'Ausências',
            href: '/ponto/atestados',
            icon: CalendarX2,
            description: 'Registrar e gerenciar ausências',
            permission: isAdministrator || can(pk('/ponto/atestados'))
          },
          {
            name: 'Gerenciar Ausências',
            href: '/ponto/gerenciar-atestados',
            icon: BookText,
            description: 'Gerenciar todas as ausências',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-atestados'))
          },
          {
            name: 'Alterações de Ponto',
            href: '/ponto/solicitacoes',
            icon: MailPlus,
            description: 'Solicitar e acompanhar alterações de marcação do ponto',
            permission: isAdministrator || can(pk('/ponto/solicitacoes'))
          },
          {
            name: 'Gerenciar Alterações de Ponto',
            href: '/ponto/gerenciar-solicitacoes',
            icon: FileText,
            description: 'Analisar e aprovar alterações de marcação dos colaboradores',
            permission: isAdministrator || can(pk('/ponto/gerenciar-solicitacoes'))
          },
          {
            name: 'Gerenciar Solicitações',
            href: '/ponto/gerenciar-solicitacoes-gerais',
            icon: FileText,
            description: 'Tramitar solicitações do Departamento Pessoal',
            permission:
              isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-solicitacoes-dp')),
          },
          {
            name: 'Central de Atendimentos',
            href: '/ponto/conversas-whatsapp',
            icon: MessageSquare,
            description: 'Conversas do chatbot WhatsApp para o pessoal ver',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/conversas-whatsapp'))
          },
          {
            name: 'Férias',
            href: '/ponto/ferias',
            icon: ImagePlus,
            description: 'Solicitar e acompanhar férias',
            permission: isAdministrator || can(pk('/ponto/ferias'))
          },
          {
            name: 'Gerenciar Férias',
            href: '/ponto/gerenciar-ferias',
            icon: BookImage,
            description: 'Gerenciar férias dos funcionários',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageVacations
          },
          {
            name: 'Gerenciar Feriados',
            href: '/ponto/gerenciar-feriados',
            icon: CalendarDays,
            description: 'Gerenciar calendário de feriados',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageVacations
          },
          {
            name: 'Banco de Horas',
            href: '/ponto/banco-horas',
            icon: FolderClock,
            description: 'Controle de banco de horas',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageBankHours
          },
          {
            name: 'Alocação',
            href: '/relatorios/alocacao',
            icon: Users,
            description: 'Alocação de funcionários',
            permission: isAdministrator || permissions.canAccessPayroll
          },
          {
            name: 'Aniversariantes',
            href: '/ponto/aniversariantes',
            icon: Cake,
            description: 'Ver aniversariantes do mês',
            permission: isAdministrator || can(pk('/ponto/aniversariantes'))
          }
        ]
      },
      {
        id: 'adm-tst',
        name: 'ADM/TST',
        icon: ClipboardList,
        items: [
          {
            name: 'Gerenciar Solicitações',
            href: '/ponto/gerenciar-solicitacoes-adm-tst',
            icon: FileText,
            description: 'Tramitar solicitações administrativas',
            permission: isAdministrator || can(pk('/ponto/gerenciar-solicitacoes-adm-tst')),
          },
        ],
      },
      {
        id: 'financeiro',
        name: 'Financeiro',
        icon: Landmark,
        items: [
          {
            name: 'Controle Financeiro',
            href: '/ponto/financeiro/controle-financeiro',
            icon: ClipboardList,
            description: 'Controle de Material/Serviço Aplicado por mês e ano',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/controle-financeiro'))
          },
          {
            name: 'Receitas',
            href: '/ponto/financeiro/receitas',
            icon: CircleDollarSign,
            description: 'Receitas e repasses dos consórcios BSB e HUB',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/receitas'))
          },
          {
            name: 'Pagamento da Folha',
            href: '/ponto/financeiro',
            icon: DollarSign,
            description: 'Borderô em PDF e remessa CNAB400 da folha',
            permission: isAdministrator || can(pk('/ponto/financeiro'))
          },
        ]
      },
      {
        id: 'metricas',
        name: 'Métricas',
        icon: BarChart3,
        items: [
          {
            name: 'Balanço Financeiro',
            href: '/ponto/financeiro/analise-extrato',
            icon: BarChart3,
            description: 'Acompanhe o balanço financeiro',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise-extrato'))
          },
          {
            name: "Controle de NF's",
            href: '/ponto/financeiro/controle-nfs',
            icon: FileSpreadsheet,
            description: 'Controle de notas fiscais por contrato (planilha Relatório de Custos)',
            permission:
              isAdministrator ||
              isDepartmentFinanceiro ||
              can(pk('/ponto/financeiro/controle-nfs')) ||
              can(pk('/ponto/financeiro/analise-extrato')) ||
              can(pk('/ponto/financeiro/controle-financeiro'))
          },
          {
            name: 'Controle Geral de Contratos',
            href: '/ponto/contratos/controle-geral',
            icon: LayoutDashboard,
            description: 'Visão consolidada de todos os contratos',
            permission: isAdministrator || can(pk('/ponto/contratos/controle-geral'))
          },
          {
            name: 'Gastos Operacionais',
            href: '/ponto/contratos/gastos-operacionais',
            icon: Wallet,
            description: 'Gastos operacionais por contrato (QUERY BASE DE GASTOS)',
            permission: isAdministrator || can(pk('/ponto/contratos/gastos-operacionais'))
          },
        ]
      },
      {
        id: 'engenharia',
        name: 'Engenharia',
        icon: DraftingCompass,
        items: [
          {
            name: 'Contratos',
            href: '/ponto/contratos',
            icon: FileText,
            description: 'Cadastro de contratos da engenharia',
            permission: isAdministrator || can(pk('/ponto/contratos'))
          },
          {
            name: 'Ordem de Serviço',
            href: '/ponto/andamento-da-os',
            icon: ClipboardList,
            description: 'Acompanhamento e controle das ordens de serviço',
            permission: canAccessOsRoutePage
          },
          {
            name: 'Solicitação de Materiais',
            href: '/ponto/solicitar-materiais',
            icon: ShoppingCart,
            description: 'Solicitar materiais para compra (SC)',
            permission: isAdministrator || can(pk('/ponto/solicitar-materiais'))
          },
          {
            name: 'Pleitos Gerados',
            href: '/ponto/pleitos-gerados',
            icon: FileCheck,
            description: 'Visualizar todos os pleitos com valor pleiteado',
            permission: isAdministrator || can(pk('/ponto/pleitos-gerados'))
          },
          {
            name: 'Fichas de Demanda',
            href: '/ponto/aprovacao-fds',
            icon: ClipboardCheck,
            description: 'Cadastro e gestão das fichas de demanda',
            permission: isAdministrator || can(pk('/ponto/aprovacao-fds'))
          },
          {
            name: 'Recebimento de Entregas',
            href: '/ponto/recebimento-entregas',
            icon: PackageCheck,
            description: 'Confirmar recebimento de material na obra',
            permission: canAccessRecebimentoEntregasRoutePage
          }
        ]
      },
      {
        id: 'contratos-licitacoes',
        name: 'Contratos e Licitações',
        icon: ScrollText,
        items: [
          {
            name: 'Espelho da Nota Fiscal',
            href: '/ponto/espelho-nf',
            icon: FileSpreadsheet,
            description: 'Montar o espelho da nota fiscal',
            permission: isAdministrator || can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Licitações',
            href: '/ponto/licitacoes',
            icon: ClipboardList,
            description: 'Acompanhar processos de licitação',
            permission: isAdministrator || can(pk('/ponto/licitacoes'))
          },
          {
            name: 'PNCP',
            href: '/ponto/licitacoes-pncp',
            icon: Search,
            description: 'Consultar publicações no Portal Nacional de Contratações',
            permission:
              isAdministrator ||
              can(pk('/ponto/licitacoes-pncp')) ||
              can(pk('/ponto/licitacoes')),
          },
          {
            name: 'Controle CREA',
            href: '/ponto/responsaveis-tecnicos',
            icon: BadgeCheck,
            description: 'Responsáveis técnicos, anuidade e pagamentos ART',
            permission:
              isAdministrator ||
              can(pk('/ponto/responsaveis-tecnicos')) ||
              can(pk('/ponto/controle-anuidade')) ||
              can(pk('/ponto/controle-pagamentos-art')),
            children: [
              {
                name: 'Responsáveis Técnicos',
                href: '/ponto/responsaveis-tecnicos',
                description: 'Cadastro de responsáveis técnicos (CREA)',
                permission: isAdministrator || can(pk('/ponto/responsaveis-tecnicos')),
              },
              {
                name: 'Anuidades',
                href: '/ponto/controle-anuidade',
                description: 'Controle de pagamentos de anuidade CREA',
                permission: isAdministrator || can(pk('/ponto/controle-anuidade')),
              },
              {
                name: "ART's / Protocolos",
                href: '/ponto/controle-pagamentos-art',
                description: 'Controle de pagamentos de ART e protocolos',
                permission: isAdministrator || can(pk('/ponto/controle-pagamentos-art')),
              },
            ],
          },
          {
            name: 'Medições',
            href: '/ponto/contratos/medicao',
            icon: FileSpreadsheet,
            description: 'Importar e visualizar planilhas de medição',
            permission: isAdministrator || can(pk('/ponto/contratos/medicao'))
          }
        ]
      },
      {
        id: 'juridico',
        name: 'Jurídico',
        icon: Scale,
        items: [
          {
            name: 'Processos Trabalhistas',
            href: '/ponto/juridico',
            icon: Scale,
            description: 'Acompanhe status, acordos e valores dos processos',
            permission: isAdministrator || isDepartmentJuridico || can(pk('/ponto/juridico'))
          }
        ]
      },
      {
        id: 'suprimentos',
        name: 'Suprimentos',
        icon: Warehouse,
        items: [
          {
            name: 'Requisições de Materiais',
            href: '/ponto/gerenciar-materiais',
            icon: Package,
            description: 'Aprovar SC e criar OC',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/gerenciar-materiais'))
          },
          {
            name: 'Mapa de Cotação',
            href: '/ponto/mapa-cotacao',
            icon: FileSpreadsheet,
            description: 'Comparar cotações entre fornecedores e gerar OC por vencedor',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/mapa-cotacao'))
          },
          {
            name: 'Ordens de Compra',
            href: '/ponto/ordem-de-compra',
            icon: FileText,
            description: 'Listar e gerenciar ordens de compra',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/ordem-de-compra'))
          },
          {
            name: 'Controle de Entregas',
            href: '/ponto/controle-entregas',
            icon: Truck,
            description: 'Acompanhar entregas de material e recebimento pela engenharia',
            permission: isAdministrator || can(pk('/ponto/controle-entregas'))
          },
          {
            name: 'Entregas Logística',
            href: '/ponto/entregas-logistica',
            icon: Truck,
            description: 'Registrar solicitações de entrega logística',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/entregas-logistica'))
          },
          {
            name: 'Estoque',
            href: '/ponto/estoque',
            icon: Package,
            description: 'Gerenciar estoque de materiais',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/estoque'))
          },
          {
            name: 'Furo de Estoque',
            href: '/ponto/furo-estoque',
            icon: PackageX,
            description: 'Pendências de entrega após recebimento parcial',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/furo-estoque'))
          },
          {
            name: 'Ajuste de Estoque',
            href: '/ponto/ajuste-estoque',
            icon: Package,
            description: 'Realizar entradas e saídas de ajuste no estoque',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/ajuste-estoque'))
          },
          {
            name: "FD's Aprovadas",
            href: '/ponto/fds-aprovadas',
            icon: ClipboardCheck,
            description: "FD's aprovadas — status de compras",
            permission:
              isAdministrator || isDepartmentCompras || can(pk('/ponto/fds-aprovadas'))
          },
          {
            name: 'Solicitações de Combustível',
            href: '/ponto/solicitacoes-combustivel',
            icon: Fuel,
            description: 'Pedidos de abastecimento feitos pela Gennecy',
            permission:
              isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-combustivel'))
          },
          {
            name: 'Reservas de Veículos',
            href: '/ponto/solicitacoes-reserva-veiculos',
            icon: CalendarRange,
            description: 'Aprovar ou rejeitar solicitações de uso da frota',
            permission:
              isAdministrator ||
              isDepartmentCompras ||
              can(pk('/ponto/solicitacoes-reserva-veiculos'))
          },
        ]
      },
      {
        id: 'cadastros',
        name: 'Cadastros',
        icon: Database,
        items: [
          {
            name: 'Centros de Custo',
            href: '/ponto/centros-custo',
            icon: Building2,
            description: 'Gerenciar centros de custo',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/centros-custo'))
          },
          {
            name: 'Materiais e Serviços',
            href: '/ponto/materiais-construcao',
            icon: Package,
            description: 'Gerenciar cadastro de materiais e serviços',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/materiais-construcao'))
          },
          {
            name: 'Fornecedores',
            href: '/ponto/fornecedores',
            icon: Building2,
            description: 'Cadastro de fornecedores',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/fornecedores'))
          },
          {
            name: 'Veículos',
            href: '/ponto/veiculos',
            icon: Car,
            description: 'Cadastro de veículos da frota',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/veiculos'))
          },
          {
            name: 'Postos de Combustível',
            href: '/ponto/regioes-postos-combustivel',
            icon: Fuel,
            description: 'Cidades satélites e postos para abastecimento',
            permission:
              isAdministrator ||
              isDepartmentCompras ||
              can(pk('/ponto/regioes-postos-combustivel'))
          },
          {
            name: 'Condições de Pagamento',
            href: '/ponto/condicoes-pagamento',
            icon: CreditCard,
            description: 'Condições para ordens de compra',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/condicoes-pagamento'))
          },
          {
            name: 'Natureza Orçamentária',
            href: '/ponto/natureza-orcamentaria',
            icon: BookPlus,
            description: 'Cadastrar naturezas orçamentárias',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/natureza-orcamentaria'))
          },
          {
            name: 'Prestadores de Serviço',
            href: '/ponto/prestadores-servico',
            icon: Truck,
            description: 'Cadastro de prestadores para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/prestadores-servico')) ||
              can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Tomadores de Serviço',
            href: '/ponto/tomadores-servico',
            icon: Contact,
            description: 'Cadastro de tomadores para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/tomadores-servico')) ||
              can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Contas Bancárias',
            href: '/ponto/contas-bancarias',
            icon: Landmark,
            description: 'Contas usadas em tomadores e no espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/contas-bancarias')) ||
              can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Códigos Tributários',
            href: '/ponto/codigos-tributarios',
            icon: Percent,
            description: 'Parâmetros por município para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/codigos-tributarios')) ||
              can(pk('/ponto/espelho-nf'))
          }
        ]
      },
      {
        id: 'time-control',
        name: 'Registros de Ponto',
        icon: Clock,
        items: [
          {
            name: 'Registros de Ponto',
            href: '/ponto',
            icon: FolderClock,
            description: 'Gerencie seus registros',
            permission: (isAdministrator || isDepartmentPessoal || permissions.canRegisterTime) && requiresTimeClock
          }
        ]
      }
    ];

    // Filtrar categorias que têm pelo menos um item com permissão
    let filteredCategories = menuCategories.filter((category) =>
      category.items.some((item) => navItemIsVisible(item as SidebarNavItem)),
    );

    // Aplicar filtro de pesquisa se houver termo de busca
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filteredCategories = filteredCategories
        .map((category) => {
          const filteredItems = category.items
            .map((item) => {
              const navItem = item as SidebarNavItem;
              if (!navItemIsVisible(navItem)) return null;
              if (!navItem.children?.length) {
                const matchesName = navItem.name.toLowerCase().includes(searchLower);
                const matchesDescription =
                  navItem.description?.toLowerCase().includes(searchLower) || false;
                return matchesName || matchesDescription ? navItem : null;
              }

              const parentMatches = navItemMatchesSearch(
                { ...navItem, children: undefined },
                searchLower,
              );
              const matchingChildren = navItem.children.filter((child) => {
                if (!child.permission) return false;
                if (parentMatches) return true;
                return (
                  child.name.toLowerCase().includes(searchLower) ||
                  Boolean(child.description?.toLowerCase().includes(searchLower))
                );
              });
              if (matchingChildren.length === 0 && !parentMatches) return null;
              return {
                ...navItem,
                children: parentMatches
                  ? navItem.children.filter((c) => c.permission)
                  : matchingChildren,
              };
            })
            .filter((item): item is SidebarNavItem => item != null);

          return filteredItems.length > 0 ? { ...category, items: filteredItems } : null;
        })
        .filter((category) => category !== null) as typeof menuCategories;
    }

    return filteredCategories;
  };

  const menuItems = getMenuItems();

  const isFooterShortcutActive = (href: string) => {
    if (pathname == null) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const resolveNavHref = (href: string) => {
    if (href === '/ponto/fluig/aprovadores' && !isLoading) {
      return buildFluigApproversNavHref({
        fullAccess: fluigApproverFullAccess,
        nameKeys: fluigApproverNameKeys,
      });
    }
    return href;
  };

  const isActive = (href: string) => {
    if (pathname == null) return false;
    if (href === '/ponto/fluig/aprovadores') {
      return pathname === href || pathname.startsWith(`${href}/`);
    }
    if (href === '/ponto/contratos') {
      if (pathname === '/ponto/contratos') return true;
      // Rotas fixas sob /ponto/contratos (ex.: controle geral) — não marcam "Contratos", só o item próprio.
      if (
        pathname.startsWith('/ponto/contratos/controle-geral') ||
        pathname.startsWith('/ponto/contratos/gastos-operacionais')
      ) {
        return false;
      }
      // Detalhe do contrato e subpáginas (orçamento, permissões, etc.)
      return /^\/ponto\/contratos\/[^/]+/.test(pathname);
    }

    return pathname === href;
  };

  const renderSidebarNavItem = (item: SidebarNavItem, forceExpanded: boolean) => {
    const ItemIcon = item.icon;
    const visibleChildren = item.children?.filter((child) => child.permission) ?? [];
    const groupKey = item.name;

    if (visibleChildren.length > 0) {
      const childActive = visibleChildren.some((child) => isActive(child.href));
      const groupState = expandedNavGroups[groupKey];
      const expanded = forceExpanded
        ? true
        : groupState === false
          ? false
          : groupState === true || childActive;
      const groupBadge = visibleChildren.reduce(
        (sum, child) => sum + navBadgeCountForHref(child.href),
        0,
      );

      return (
        <div key={`group-${groupKey}`} className="space-y-1">
          <button
            type="button"
            onClick={() => {
              if (forceExpanded) return;
              setExpandedNavGroups((prev) => ({
                ...prev,
                [groupKey]: !expanded,
              }));
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
              childActive
                ? 'bg-red-50/70 text-red-700 dark:bg-red-900/10 dark:text-red-500'
                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
            aria-expanded={expanded}
          >
            <ItemIcon
              className={`h-4 w-4 flex-shrink-0 ${
                childActive ? 'text-red-600 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{item.name}</span>
            <NotificationCountBadge count={groupBadge} />
            <ChevronDown
              className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                expanded ? 'rotate-180' : 'rotate-0'
              } ${
                childActive ? 'text-red-600 dark:text-red-500' : 'text-gray-400'
              }`}
            />
          </button>
          {expanded ? (
            <div className="ml-3 space-y-1 border-l border-gray-200 pl-2 dark:border-gray-700">
              {visibleChildren.map((child) => {
                const active = isActive(child.href);
                const badgeCount = navBadgeCountForHref(child.href);
                return (
                  <Link
                    key={child.href}
                    href={resolveNavHref(child.href)}
                    prefetch={navLinkPrefetch}
                    onMouseEnter={
                      FLUIG_PREFETCH_HREFS.has(child.href) ? prefetchFluigDatasets : undefined
                    }
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ${
                      active
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-500'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{child.name}</span>
                    <NotificationCountBadge count={badgeCount} />
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    }

    const active = isActive(item.href);
    const badgeCount = navBadgeCountForHref(item.href);
    return (
      <Link
        key={item.href}
        href={resolveNavHref(item.href)}
        prefetch={navLinkPrefetch}
        onMouseEnter={FLUIG_PREFETCH_HREFS.has(item.href) ? prefetchFluigDatasets : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
          active
            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-500'
            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        <ItemIcon
          className={`h-4 w-4 flex-shrink-0 ${
            active ? 'text-red-600 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
        <NotificationCountBadge count={badgeCount} />
      </Link>
    );
  };

  const activeModuleId = menuItems.find((category) =>
    category.items.some((item) => {
      const navItem = item as SidebarNavItem;
      if (!navItemIsVisible(navItem)) return false;
      if (navItem.children?.length) return navItemHasActiveChild(navItem);
      return isActive(navItem.href);
    }),
  )?.id;

  const onRailFooterRoute = isRailFooterRoute(pathname);
  const onHomeRoute = isHomeRoute(pathname);
  const routeForcesCollapsed = onHomeRoute || onRailFooterRoute;
  const effectiveCollapsed = sidebarHydrated ? isCollapsed : routeForcesCollapsed;
  const tier2Visible = !effectiveCollapsed || isOpen;

  const displayedModuleId = userPickedModuleRef.current
    ? selectedModuleId
    : (activeModuleId ?? selectedModuleId);

  const selectedModule = menuItems.find((c) => c.id === displayedModuleId) ?? menuItems[0];

  /** Rail: painel aberto → módulo exibido; recolhido → rota ativa; na home recolhida → nenhum (só logo) */
  const railModuleActiveId: string | null = tier2Visible
    ? displayedModuleId
    : activeModuleId ?? (onHomeRoute || onRailFooterRoute ? null : displayedModuleId);

  const closeSidebarPanel = useCallback(() => {
    userPickedModuleRef.current = false;
    if (activeModuleId) {
      setSelectedModuleId(activeModuleId);
    } else if (!onHomeRoute && onRailFooterRoute && menuItems[0]) {
      setSelectedModuleId(menuItems[0].id);
    }
    setCollapsed(true);
    setIsOpen(false);
  }, [activeModuleId, menuItems, onHomeRoute, onRailFooterRoute, setCollapsed]);

  const handleCollapseSidebar = () => {
    closeSidebarPanel();
  };

  // Ao mudar de rota: recolhe só em home/atalhos do rodapé; demais rotas mantêm o painel aberto
  React.useEffect(() => {
    if (pathname === prevPathnameRef.current) return;
    prevPathnameRef.current = pathname;
    userPickedModuleRef.current = false;

    if (onHomeRoute || onRailFooterRoute) {
      setCollapsed(true);
      setIsOpen(false);
      return;
    }

    if (activeModuleId && activeModuleId !== selectedModuleId) {
      setSelectedModuleId(activeModuleId);
      return;
    }

    const activeCategory = menuItems.find((category) =>
      category.items.some((item) => {
        const navItem = item as SidebarNavItem;
        if (!navItemIsVisible(navItem)) return false;
        if (navItem.children?.length) return navItemHasActiveChild(navItem);
        return isActive(navItem.href);
      }),
    );
    if (activeCategory) {
      setSelectedModuleId(activeCategory.id);
    } else if (menuItems.length > 0 && !menuItems.some((c) => c.id === selectedModuleId)) {
      setSelectedModuleId(menuItems[0].id);
    }
  }, [pathname, menuItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    writeSelectedModuleId(selectedModuleId);
  }, [selectedModuleId]);

  const handleSelectModule = (categoryId: string) => {
    const panelOpen = !isCollapsed || isOpen;
    if (panelOpen && displayedModuleId === categoryId) {
      closeSidebarPanel();
      return;
    }
    userPickedModuleRef.current = true;
    setSelectedModuleId(categoryId);
    if (isCollapsed) setCollapsed(false);
  };

  // Fecha o painel ao clicar fora da sidebar no desktop (mobile usa o overlay)
  React.useEffect(() => {
    if (effectiveCollapsed) return;

    const handlePointerDown = (event: PointerEvent) => {
      const sidebarEl = sidebarRef.current;
      if (!sidebarEl) return;
      if (sidebarEl.contains(event.target as Node)) return;
      closeSidebarPanel();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [effectiveCollapsed, closeSidebarPanel]);

  // Mobile drawer: trava scroll do body e fecha ao passar para desktop
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onViewportChange = () => {
      if (mq.matches) setIsOpen(false);
    };
    onViewportChange();
    mq.addEventListener('change', onViewportChange);
    return () => mq.removeEventListener('change', onViewportChange);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    if (mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    const savedModule = readSelectedModuleId();
    if (savedModule) setSelectedModuleId(savedModule);

    let collapsed = readSidebarCollapsed();
    if (isHomeRoute(pathname) || isRailFooterRoute(pathname)) {
      collapsed = true;
    }
    setIsCollapsedState(collapsed);
    onMenuToggle?.(collapsed);
    setSidebarHydrated(true);
  }, [onMenuToggle, pathname]);

  // Salvar estado no localStorage sempre que mudar (após hidratação)
  React.useEffect(() => {
    if (!sidebarHydrated) return;
    writeSidebarCollapsed(isCollapsed);
  }, [isCollapsed, sidebarHydrated]);

  return (
    <>
      {/* Botão de menu mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white dark:bg-gray-900 rounded-lg shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={closeSidebarPanel}
        />
      )}

      {/* Dual-tier Sidebar */}
      <div
        ref={sidebarRef}
        data-app-sidebar
        className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] transform overflow-hidden transition-all ${SIDEBAR_TRANSITION_CLASS} ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Tier 1 — Rail de módulos */}
        <div className="flex h-full min-h-0 w-20 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="relative z-0 isolate flex flex-shrink-0 flex-col items-center p-5 pb-3 [@media(max-height:820px)]:p-2.5 [@media(max-height:820px)]:pb-1.5">
            <Link
              href="/ponto/home"
              prefetch={navLinkPrefetch}
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl transition-all hover:scale-105 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8"
              title="Ir para a página inicial"
              aria-label="Página inicial"
              aria-current={onHomeRoute ? 'page' : undefined}
            >
              <img
                src={logoSrc}
                alt={logoAlt}
                className="h-full w-full object-contain"
              />
            </Link>
          </div>

          <nav className="scrollbar-hide relative z-30 min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pb-4 pt-3 [@media(max-height:820px)]:space-y-1 [@media(max-height:820px)]:px-1.5 [@media(max-height:820px)]:pb-2 [@media(max-height:820px)]:pt-1">
            {sidebarHydrated && !isLoading ? menuItems.map((category) => {
              const CategoryIcon = category.icon;
              const isRailActive = category.id === railModuleActiveId;
              const visibleItems = category.items.filter((item) =>
                navItemIsVisible(item as SidebarNavItem),
              );
              const forceAsGroup = !(category as { preferDirectLink?: boolean }).preferDirectLink;
              const isSingleItem = visibleItems.length === 1 && !forceAsGroup;
              const singleItem = isSingleItem ? visibleItems[0] : null;

              if (isSingleItem && singleItem) {
                const active = isActive(singleItem.href);
                const SingleItemIcon = singleItem.icon || CategoryIcon;
                const singleBadge = navBadgeCountForHref(singleItem.href);
                return (
                  <SidebarRailTooltip key={category.id} label={singleItem.name}>
                    <Link
                      href={singleItem.href}
                      prefetch={navLinkPrefetch}
                      className={`relative z-10 flex h-10 w-10 items-center justify-center overflow-visible rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                        active
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      aria-label={singleItem.name}
                    >
                      <SingleItemIcon className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                      <NotificationCountBadge count={singleBadge} rail />
                    </Link>
                  </SidebarRailTooltip>
                );
              }

              const moduleBadge = moduleBadgeCountForVisibleItems(visibleItems);
              return (
                <SidebarRailTooltip key={category.id} label={category.name}>
                  <button
                    type="button"
                    onClick={() => handleSelectModule(category.id)}
                    className={`relative z-10 flex h-10 w-10 items-center justify-center overflow-visible rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                      isRailActive
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    aria-label={category.name}
                    aria-current={isRailActive ? 'true' : undefined}
                  >
                    <CategoryIcon className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                    <NotificationCountBadge count={moduleBadge} rail />
                  </button>
                </SidebarRailTooltip>
              );
            }) : (
              Array.from({ length: 6 }, (_, i) => (
                <div key={`rail-skeleton-${i}`} className="flex justify-center">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                </div>
              ))
            )}
          </nav>

          {/* Rodapé: atalhos, divisor e perfil */}
          <div className="relative z-20 flex flex-shrink-0 flex-col items-center overflow-visible px-2 pb-4 [@media(max-height:820px)]:pb-2">
            <div className="flex flex-col items-center gap-2 [@media(max-height:820px)]:gap-1">
              <SidebarRailTooltip label="Chat">
                <Link
                  href="/ponto/conversas"
                  prefetch={navLinkPrefetch}
                  aria-label={`Chat${chatUnreadCount > 0 ? `, ${chatUnreadCount} não lidas` : ''}`}
                  className={`relative z-10 flex h-10 w-10 items-center justify-center overflow-visible rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/conversas')
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <MessagesSquare className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" strokeWidth={2} />
                  <NotificationCountBadge count={chatUnreadCount} rail />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Tasks">
                <Link
                  href="/ponto/kanban"
                  prefetch={navLinkPrefetch}
                  aria-label="Tasks"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/kanban')
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <SquareKanban className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Agenda">
                <Link
                  href="/ponto/agenda"
                  prefetch={navLinkPrefetch}
                  aria-label="Agenda"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/agenda')
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <CalendarRange className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Flow">
                <Link
                  href="/ponto/flow"
                  prefetch={navLinkPrefetch}
                  aria-label="Flow"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/flow')
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Workflow className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Drive">
                <Link
                  href="/ponto/drive"
                  prefetch={navLinkPrefetch}
                  aria-label="Drive"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/drive')
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <HardDrive className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
            </div>
            <div className="mt-2 flex flex-col items-center gap-2 [@media(max-height:820px)]:mt-1.5">
              <div className="h-px w-12 shrink-0 bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="flex w-full justify-center pt-4 [@media(max-height:820px)]:pt-2">
            <div ref={profileAvatarSectionRef} className="relative size-12 shrink-0 [@media(max-height:820px)]:size-10">
                      <button
                        type="button"
                        aria-haspopup="true"
                        aria-expanded={profileAvatarMenu}
                        aria-label="Configurações e foto de perfil"
                        onClick={() => setProfileAvatarMenu((v) => !v)}
                        className="group relative block size-12 overflow-hidden rounded-full focus:outline-none focus:ring-2 focus:ring-red-500/50 [@media(max-height:820px)]:size-10"
                      >
                        <div className="relative flex size-12 items-center justify-center overflow-hidden rounded-full bg-red-600 [@media(max-height:820px)]:size-10">
                          {profilePhotoHref ? (
                            <img
                              src={profilePhotoHref}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="font-semibold text-white text-sm">
                              {getInitials(user?.name || userName || 'U')}
                            </span>
                          )}
                          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                            <Settings size={14} className="text-white shrink-0" strokeWidth={2} />
                          </div>
                          {(uploadProfilePhotoMutation.isPending ||
                            removeProfilePhotoMutation.isPending) && (
                            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                              <Loader2 size={20} className="animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      </button>

                      <input
                        ref={profileAvatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setProfileCropSrc(URL.createObjectURL(file));
                          setProfileAvatarMenu(false);
                          e.target.value = '';
                        }}
                      />

                      {profileAvatarMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-[100]"
                            aria-hidden="true"
                            onClick={() => setProfileAvatarMenu(false)}
                          />
                          <div
                            role="menu"
                            className="absolute z-[120] min-w-[200px] rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden py-1 left-full ml-2 bottom-0"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setProfileAvatarMenu(false);
                                profileAvatarInputRef.current?.click();
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Camera size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              <span className="font-medium">Carregar foto</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                toggleTheme();
                                setProfileAvatarMenu(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              {isDark ? (
                                <Sun size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              ) : (
                                <Moon size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              )}
                              <span className="font-medium">{isDark ? 'Modo Claro' : 'Modo Escuro'}</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setProfileAvatarMenu(false);
                                onOpenChangePassword?.();
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Lock size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              <span className="font-medium">Alterar Senha</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={handleLogout}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-red-900/20 transition-colors group"
                            >
                              <LogOut size={15} className="text-gray-500 dark:text-gray-400 shrink-0 group-hover:text-red-600 dark:group-hover:text-red-400" />
                              <span className="font-medium group-hover:text-red-600 dark:group-hover:text-red-400">Sair</span>
                            </button>
                          </div>
                        </>
                      )}
            </div>
            </div>
          </div>
        </div>

        {/* Tier 2 — Painel de páginas do módulo */}
        <div
          className={`flex h-full min-h-0 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${
            sidebarHydrated ? `transition-[width,opacity] ${SIDEBAR_TRANSITION_CLASS}` : 'transition-none'
          } ${tier2Visible ? 'w-72 opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
        >
          {/* Header do módulo */}
          <div className="p-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {searchTerm.trim() ? 'Busca' : selectedModule?.name ?? 'Menu'}
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleCollapseSidebar}
                  className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8"
                  title="Recolher menu"
                >
                  <ArrowLeftToLine className="w-5 h-5 flex-shrink-0" />
                </button>
                <button
                  onClick={closeSidebarPanel}
                  className="lg:hidden w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Busca */}
          <div className="px-4 flex-shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Lista de páginas */}
          <nav className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain p-4 pt-4">
            {sidebarHydrated && !isLoading ? searchTerm.trim() ? (
              menuItems.map((category) => {
                const filteredItems = (category.items as SidebarNavItem[]).filter(navItemIsVisible);
                if (filteredItems.length === 0) return null;
                return (
                  <div key={category.id} className="mb-4">
                    <p className="px-3 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {category.name}
                    </p>
                    <div className="space-y-3">
                      {filteredItems.map((item) => renderSidebarNavItem(item, true))}
                    </div>
                  </div>
                );
              })
            ) : (
              selectedModule?.items
                .filter((item) => navItemIsVisible(item as SidebarNavItem))
                .map((item) => renderSidebarNavItem(item as SidebarNavItem, false))
            ) : null}
          </nav>

        </div>
      </div>

      {/* Modal de Confirmação de Logout */}
      {showLogoutConfirm && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleCancelLogout} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
              Deseja sair?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
              Tem certeza que deseja sair do sistema? Você precisará fazer login novamente para acessar.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={handleCancelLogout}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      <CircularPhotoCropModal
        open={!!profileCropSrc}
        imageSrc={profileCropSrc ?? ''}
        onClose={() => {
          if (profileCropSrc) URL.revokeObjectURL(profileCropSrc);
          setProfileCropSrc(null);
        }}
        onConfirm={async (file: File) => {
          await uploadProfilePhotoMutation.mutateAsync(file);
        }}
        onPickReplacement={(file) => {
          if (profileCropSrc) URL.revokeObjectURL(profileCropSrc);
          setProfileCropSrc(URL.createObjectURL(file));
        }}
      />

    </>
  );
}
