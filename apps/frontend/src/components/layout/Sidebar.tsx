'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { buildFluigApproversNavHref } from '@/lib/fluigWorkflowApproval';
import {
  fetchGastosOperacionaisTotvs,
  GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY,
  GASTOS_OPERACIONAIS_TOTVS_STALE_TIME,
} from '@/app/ponto/contratos/controle-geral/fetchGastosOperacionaisTotvs';
import { readGastosOperacionaisTotvsPersisted } from '@/app/ponto/contratos/controle-geral/gastosOperacionaisTotvsPersist';
import {
  Home,
  Users,
  Clock,
  X,
  User,
  ArrowLeftToLine,
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
  MessageCircle,
  MessageSquare,
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
  Shield,
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
  Briefcase,
  ScrollText,
  Fuel,
  Car,
  CalendarRange,
  MapPin,
  Wrench,
  Boxes,
  Workflow,
  ChevronDown,
  HelpCircle,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import { useFdNotificationCounts } from '@/hooks/useFdNotificationCounts';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import {
  readSelectedModuleId,
  readSidebarCollapsed,
  SIDEBAR_TRANSITION_CLASS,
  SIDEBAR_TRANSITION_MS,
  writeSelectedModuleId,
  writeSidebarCollapsed,
  isHomeRoute,
  isRailFooterRoute,
  shouldForceSidebarCollapsed,
} from '@/lib/sidebarStorage';
import {
  LAYOUT_CHROME,
  dispatchReplayPageEnter,
  type MenuSearchDetail,
} from '@/lib/layoutChrome';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';

const FLUIG_APPROVAL_DATASET_IDS = [
  'Processos_Workflow_Aprovacao_G3',
  'Processos_Workflow_Aprovacao_G5',
];
const FLUIG_PREFETCH_HREFS = new Set([
  '/ponto/fluig/aprovacoes-workflow',
  '/ponto/fluig/aprovadores',
]);
const GASTOS_OPERACIONAIS_HREF = '/ponto/contratos/gastos-operacionais';
const GASTOS_OPERACIONAIS_MODULE_KEY = pathToModuleKey(GASTOS_OPERACIONAIS_HREF);

const pk = pathToModuleKey;

interface SidebarProps {
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
  onMenuToggle?: (collapsed: boolean) => void;
  onOpenChangePassword?: () => void;
}

function SidebarRailTooltip({
  label,
  children,
  enterIndex,
}: {
  label: string;
  children: React.ReactNode;
  enterIndex?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const showTooltip = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const el = triggerRef.current;
    if (!el) return;
    clearHideTimer();
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
    setVisible(true);
  }, [clearHideTimer]);

  const hideTooltip = useCallback(() => {
    clearHideTimer();
    setVisible(false);
  }, [clearHideTimer]);

  const hideIfNotHovering = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      const el = triggerRef.current;
      if (el?.matches(':hover')) return;
      setVisible(false);
    }, 80);
  }, [clearHideTimer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hideTooltip();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', hideTooltip);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', hideTooltip);
      clearHideTimer();
    };
  }, [hideTooltip, clearHideTimer]);

  return (
    <>
      <div
        ref={triggerRef}
        className="sidebar-rail-enter-item relative flex justify-center"
        style={
          enterIndex != null
            ? ({ ['--rail-i' as string]: enterIndex } as React.CSSProperties)
            : undefined
        }
        onPointerEnter={showTooltip}
        onPointerLeave={hideIfNotHovering}
        onFocusCapture={(event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.matches(':focus-visible')) {
            showTooltip();
          }
        }}
        onBlurCapture={hideIfNotHovering}
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
            className="pointer-events-none max-w-[14rem] whitespace-nowrap rounded-md bg-slate-800/90 px-2.5 py-1.5 text-xs font-medium text-white shadow-md backdrop-blur-sm"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  );
}

export function Sidebar({ userRole, onMenuToggle }: SidebarProps) {
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
    canAccessCollaborationTools,
  } = usePermissions();
  const { logoSrc, logoAlt } = useBrandingLogo();
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

  const prefetchGastosOperacionais = useCallback(() => {
    router.prefetch(GASTOS_OPERACIONAIS_HREF);

    void (async () => {
      const persisted = await readGastosOperacionaisTotvsPersisted();
      if (persisted) {
        queryClient.setQueryData(GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY, persisted.data);
        const cached = queryClient.getQueryCache().find({
          queryKey: GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY
        });
        if (cached) {
          cached.setState({ dataUpdatedAt: persisted.updatedAt });
        }
        if (Date.now() - persisted.updatedAt < GASTOS_OPERACIONAIS_TOTVS_STALE_TIME) {
          return;
        }
      }

      void queryClient.prefetchQuery({
        queryKey: GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY,
        queryFn: fetchGastosOperacionaisTotvs,
        staleTime: GASTOS_OPERACIONAIS_TOTVS_STALE_TIME,
      });
    })();
  }, [queryClient, router]);

  const navDataPrefetchForHref = useCallback(
    (href: string) => {
      if (FLUIG_PREFETCH_HREFS.has(href)) return prefetchFluigDatasets;
      if (href === GASTOS_OPERACIONAIS_HREF) return prefetchGastosOperacionais;
      return undefined;
    },
    [prefetchFluigDatasets, prefetchGastosOperacionais]
  );

  // Prefetch automático: pré-carrega rotas e dados Fluig assim que o usuário faz login.
  useEffect(() => {
    if (!user || isLoading) return;

    const fluigApproversHref = buildFluigApproversNavHref({
      fullAccess: fluigApproverFullAccess,
      nameKeys: fluigApproverNameKeys,
    });
    const canPrefetchGastos =
      userPosition === 'Administrador' || can(GASTOS_OPERACIONAIS_MODULE_KEY);

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

      if (canPrefetchGastos) {
        prefetchGastosOperacionais();
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
    userPosition,
    can,
    prefetchGastosOperacionais,
  ]);

  // Verificar se é administrador
  const isAdministrator = userPosition === 'Administrador';
  const canSeeFuroEstoque =
    isAdministrator || can(pk('/ponto/furo-estoque'));
  const canSeeFuelSupplies =
    isAdministrator || can(pk('/ponto/solicitacoes-combustivel'));
  const canSeeVehicleReservationSupplies =
    isAdministrator || can(pk('/ponto/solicitacoes-reserva-veiculos'));
  const canSeeToolRentalSupplies =
    isAdministrator || can(pk('/ponto/solicitacoes-ferramentas'));
  const canSeeEntregaLogistica =
    isAdministrator || can(pk('/ponto/entrega-logistica'));

  const { data: chatUnreadCount = 0 } = useQuery({
    queryKey: ['chat-unread-count', user?.id],
    queryFn: async () => {
      const res = await api.get('/chats/direct/unread/count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canAccessCollaborationTools && !!user?.id,
    staleTime: 15_000,
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    refetchOnWindowFocus: true,
  });

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

  const { data: toolRentalSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['tool-rental-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeToolRentalSupplies && !isLoading,
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
    // RM já entra no badge de Aprovações — não somar de novo em Suprimentos
    if (href === '/ponto/gerenciar-materiais' && canApproveMaterialRequests) {
      const aprovacoesVisible =
        canAccessDpApproverPages ||
        canApproveEspelhoNf ||
        canApproveOc ||
        canApproveFuel ||
        canApproveMaterialRequests;
      if (aprovacoesVisible) return 0;
      return approvalCounts.rm;
    }
    if (href === '/ponto/fds-aprovadas') return fdNotificationCounts.pendingPurchase;
    if (href === '/ponto/furo-estoque') return pendingFuroCount;
    if (href === '/ponto/recebimento-entregas') return recebimentoPendingCount;
    if (href === '/ponto/solicitacoes-combustivel') return fuelSuppliesPendingCount;
    if (href === '/ponto/solicitacoes-reserva-veiculos') return vehicleReservationSuppliesPendingCount;
    if (href === '/ponto/solicitacoes-ferramentas') return toolRentalSuppliesPendingCount;
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
    /** Título de agrupamento na lista do módulo (ex.: Central de Chamados). */
    section?: string;
  };

  const byNavName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

  const sortNavItemsByName = <
    T extends { name: string; children?: SidebarNavLeaf[]; section?: string }
  >(
    items: T[]
  ): T[] => {
    const prepared = [...items].map((item) =>
      item.children?.length
        ? { ...item, children: sortNavItemsByName(item.children) }
        : item
    );
    const hasSections = prepared.some((item) => item.section);
    if (!hasSections) {
      return prepared.sort(byNavName);
    }

    const unsectioned: T[] = [];
    const sectionOrder: string[] = [];
    const buckets = new Map<string, T[]>();
    for (const item of prepared) {
      const section = item.section?.trim();
      if (!section) {
        unsectioned.push(item);
        continue;
      }
      if (!buckets.has(section)) {
        sectionOrder.push(section);
        buckets.set(section, []);
      }
      buckets.get(section)!.push(item);
    }

    return [
      ...unsectioned.sort(byNavName),
      ...sectionOrder.flatMap((section) => (buckets.get(section) ?? []).sort(byNavName))
    ];
  };

  const groupNavItemsBySection = (items: SidebarNavItem[]) => {
    const groups: Array<{ title: string | null; items: SidebarNavItem[] }> = [];
    for (const item of items) {
      const title = item.section?.trim() || null;
      const last = groups[groups.length - 1];
      if (last && last.title === title) {
        last.items.push(item);
      } else {
        groups.push({ title, items: [item] });
      }
    }
    return groups;
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
  
  const isEmployee = userRole === 'EMPLOYEE';

  // Menu items agrupados por categoria
  const getMenuItems = () => {
    const menuCategories = [
      {
        id: 'main',
        name: 'Principal',
        icon: Home,
        items: [
          {
            name: 'Painel do Sistema',
            href: '/ponto/painel-do-sistema',
            icon: LayoutDashboard,
            description: 'Visão geral do sistema',
            permission: isAdministrator || permissions.canViewDashboard
          },
          {
            name: 'Fluig - Processos',
            href: '/ponto/financeiro/gestao-solicitacoes',
            icon: BarChart3,
            description: 'Solicitações do Fluig na visão financeira',
            permission: isAdministrator || can(pk('/ponto/financeiro/gestao-solicitacoes'))
          },
          {
            name: 'Fluig - Aprovações',
            href: '/ponto/fluig/aprovacoes-workflow',
            icon: FileCheck,
            description: 'Status de aprovação Compras, Gestor e Diretoria (G3/G5)',
            permission:
              isAdministrator || can(pk('/ponto/fluig/aprovacoes-workflow'))
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
            name: 'Solicitações Internas',
            href: '/ponto/solicitacoes-gerais',
            icon: MailPlus,
            description: 'Minhas solicitações ao DP',
            permission: isAdministrator || can(pk('/ponto/solicitacoes-dp'))
          },
          {
            name: 'Frota',
            href: '/ponto/reserva-veiculos',
            icon: Car,
            description: 'Solicitar reserva de veículos da frota',
            permission:
              isAdministrator || can(pk('/ponto/reserva-veiculos'))
          },
          {
            name: 'Abastecimento',
            href: '/ponto/solicitar-combustivel',
            icon: Fuel,
            description: 'Solicitar abastecimento de veículos',
            permission:
              isAdministrator || can(pk('/ponto/solicitar-combustivel'))
          },
          {
            name: 'Meus Chamados',
            href: '/ponto/meus-chamados',
            icon: Wrench,
            description: 'Abrir e acompanhar seus chamados de manutenção',
            permission: isAdministrator || can(pk('/ponto/meus-chamados'))
          },
          {
            name: 'Entrega da Logística',
            href: '/ponto/entrega-logistica',
            icon: Truck,
            description: 'Finalizar solicitações de entrega logística',
            permission: isAdministrator || can(pk('/ponto/entrega-logistica'))
          },
          {
            name: 'Central de Ajuda',
            href: '/ponto/central-de-ajuda',
            icon: HelpCircle,
            description: 'Guias e tutoriais passo a passo do sistema',
            permission: true,
          },
        ]
      },
      {
        id: 'departamento-pessoal',
        name: 'Departamento Pessoal',
        icon: Users,
        items: [
          {
            name: 'Funcionários e Externos',
            href: '/ponto/funcionarios',
            icon: Users,
            description: 'Cadastrar e gerenciar funcionários e externos',
            permission: isAdministrator || permissions.canManageEmployees
          },
          {
            name: 'Folha de Pagamento',
            href: '/ponto/folha-pagamento',
            icon: FileSpreadsheet,
            description: 'Gestão de folha de pagamento',
            permission: isAdministrator || permissions.canAccessPayroll
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
            permission: isAdministrator || can(pk('/ponto/gerenciar-atestados'))
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
              isAdministrator || can(pk('/ponto/gerenciar-solicitacoes-dp')),
          },
          {
            name: 'Central de Atendimentos',
            href: '/ponto/conversas-whatsapp',
            icon: MessageSquare,
            description: 'Conversas do chatbot WhatsApp para o pessoal ver',
            permission: isAdministrator || can(pk('/ponto/conversas-whatsapp'))
          },
          {
            name: 'Suporte ao Sistema',
            href: '/ponto/suporte-ti',
            icon: LifeBuoy,
            description: 'Chamados de senha, erro e permissão abertos pela Gennecy',
            permission: isAdministrator || can(pk('/ponto/suporte-ti'))
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
            permission: isAdministrator || permissions.canManageVacations
          },
          {
            name: 'Gerenciar Feriados',
            href: '/ponto/gerenciar-feriados',
            icon: CalendarDays,
            description: 'Gerenciar calendário de feriados',
            permission: isAdministrator || permissions.canManageVacations
          },
          {
            name: 'Banco de Horas',
            href: '/ponto/banco-horas',
            icon: FolderClock,
            description: 'Controle de banco de horas',
            permission: isAdministrator || permissions.canManageBankHours
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
          },
          {
            name: 'Segurança do Trabalho',
            href: '/ponto/seguranca-do-trabalho',
            icon: Shield,
            description: 'Controle de ASO dos funcionários',
            permission:
              isAdministrator || can(pk('/ponto/seguranca-do-trabalho')),
          },
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
            permission: isAdministrator || can(pk('/ponto/financeiro/controle-financeiro'))
          },
          {
            name: 'Receitas',
            href: '/ponto/financeiro/receitas',
            icon: CircleDollarSign,
            description: 'Receitas e repasses dos consórcios BSB e HUB',
            permission: isAdministrator || can(pk('/ponto/financeiro/receitas'))
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
            permission: isAdministrator || can(pk('/ponto/financeiro/analise-extrato'))
          },
          {
            name: "Controle de NF's",
            href: '/ponto/financeiro/controle-nfs',
            icon: FileSpreadsheet,
            description: 'Controle de notas fiscais por contrato (planilha Relatório de Custos)',
            permission:
              isAdministrator || can(pk('/ponto/financeiro/controle-nfs'))
          },
          {
            name: 'Entrada Fiscal',
            href: '/ponto/financeiro/nfs-recebidas',
            icon: FileText,
            description: 'Notas fiscais emitidas contra a empresa (SEFAZ)',
            permission:
              isAdministrator || can(pk('/ponto/financeiro/nfs-recebidas'))
          },
          {
            name: 'Controle Geral de Contratos',
            href: '/ponto/contratos/controle-geral',
            icon: LayoutDashboard,
            description: 'Visão consolidada de todos os contratos',
            permission: isAdministrator || can(pk('/ponto/contratos/controle-geral'))
          },
          {
            name: 'Contratos Sócios',
            href: '/ponto/contratos/socios',
            icon: Users,
            description: 'Controle dos contratos compartilhados com sócios',
            permission: isAdministrator || can(pk('/ponto/contratos/socios'))
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
            name: 'Central de Chamados',
            href: '/ponto/sistema-gestao-os',
            icon: Wrench,
            description: 'Visão geral e gestão de todos os chamados de manutenção',
            permission: isAdministrator || can(pk('/ponto/sistema-gestao-os')),
            section: 'Central de Chamados'
          },
          {
            name: 'Planos de Manutenção',
            href: '/ponto/sistema-gestao-os/planos',
            icon: CalendarRange,
            description: 'Planos preventivos, PMOC e segurança',
            permission: isAdministrator || can(pk('/ponto/sistema-gestao-os/planos')),
            section: 'Central de Chamados'
          },
          {
            name: 'Relatórios de Chamados',
            href: '/ponto/sistema-gestao-os/relatorios',
            icon: BarChart3,
            description: 'Indicadores e exportação da Central de Chamados',
            permission: isAdministrator || can(pk('/ponto/sistema-gestao-os/relatorios')),
            section: 'Central de Chamados'
          },
          {
            name: 'Contratos',
            href: '/ponto/contratos',
            icon: FileText,
            description: 'Cadastro de contratos da engenharia',
            permission: isAdministrator || can(pk('/ponto/contratos')),
            section: 'Obras'
          },
          {
            name: 'Ordem de Serviço',
            href: '/ponto/andamento-da-os',
            icon: ClipboardList,
            description: 'Acompanhamento e controle das ordens de serviço',
            permission: canAccessOsRoutePage,
            section: 'Obras'
          },
          {
            name: 'Solicitação de Materiais',
            href: '/ponto/solicitar-materiais',
            icon: ShoppingCart,
            description: 'Solicitar materiais para compra (SC)',
            permission: isAdministrator || can(pk('/ponto/solicitar-materiais')),
            section: 'Obras'
          },
          {
            name: 'Pleitos Gerados',
            href: '/ponto/pleitos-gerados',
            icon: FileCheck,
            description: 'Visualizar todos os pleitos com valor pleiteado',
            permission: isAdministrator || can(pk('/ponto/pleitos-gerados')),
            section: 'Obras'
          },
          {
            name: 'Fichas de Demanda',
            href: '/ponto/aprovacao-fds',
            icon: ClipboardCheck,
            description: 'Cadastro e gestão das fichas de demanda',
            permission: isAdministrator || can(pk('/ponto/aprovacao-fds')),
            section: 'Obras'
          },
          {
            name: 'Recebimento de Entregas',
            href: '/ponto/recebimento-entregas',
            icon: PackageCheck,
            description: 'Confirmar recebimento de material na obra',
            permission: canAccessRecebimentoEntregasRoutePage,
            section: 'Obras'
          },
          {
            name: 'Solicitação de Ferramentas',
            href: '/ponto/solicitar-ferramentas',
            icon: Wrench,
            description: 'Solicitar locação, renovação, devolução ou compra de equipamentos',
            permission: isAdministrator || can(pk('/ponto/solicitar-ferramentas')),
            section: 'Obras'
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
            permission: isAdministrator || can(pk('/ponto/licitacoes-pncp')),
          },
          {
            name: 'Responsáveis Técnicos',
            href: '/ponto/responsaveis-tecnicos',
            icon: BadgeCheck,
            description: 'Cadastro de responsáveis técnicos (CREA)',
            permission: isAdministrator || can(pk('/ponto/responsaveis-tecnicos')),
          },
          {
            name: 'Anuidades',
            href: '/ponto/controle-anuidade',
            icon: CalendarDays,
            description: 'Controle de pagamentos de anuidade CREA',
            permission: isAdministrator || can(pk('/ponto/controle-anuidade')),
          },
          {
            name: "ART's / Protocolos",
            href: '/ponto/controle-pagamentos-art',
            icon: FileCheck,
            description: 'Controle de pagamentos de ART e protocolos',
            permission: isAdministrator || can(pk('/ponto/controle-pagamentos-art')),
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
            name: 'Processos Ativos',
            href: '/ponto/juridico/processos-ativos',
            icon: Briefcase,
            description: 'Lista de processos jurídicos em andamento',
            permission: isAdministrator || can(pk('/ponto/juridico/processos-ativos'))
          },
          {
            name: 'Dashboards dos Processos',
            href: '/ponto/juridico/processos-ativos/dashboard',
            icon: BarChart3,
            description: 'Indicadores de causas, sentenças, recursos e acordos',
            permission: isAdministrator || can(pk('/ponto/juridico/processos-ativos/dashboard'))
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
            permission: isAdministrator || can(pk('/ponto/gerenciar-materiais'))
          },
          {
            name: 'Mapa de Cotação',
            href: '/ponto/mapa-cotacao',
            icon: FileSpreadsheet,
            description: 'Comparar cotações entre fornecedores e gerar OC por vencedor',
            permission: isAdministrator || can(pk('/ponto/mapa-cotacao'))
          },
          {
            name: 'Ordens de Compra',
            href: '/ponto/ordem-de-compra',
            icon: FileText,
            description: 'Listar e gerenciar ordens de compra',
            permission: isAdministrator || can(pk('/ponto/ordem-de-compra'))
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
            permission: isAdministrator || can(pk('/ponto/entregas-logistica'))
          },
          {
            name: 'Estoque',
            href: '/ponto/estoque',
            icon: Package,
            description: 'Gerenciar estoque de materiais',
            permission: isAdministrator || can(pk('/ponto/estoque'))
          },
          {
            name: 'Furo de Estoque',
            href: '/ponto/furo-estoque',
            icon: PackageX,
            description: 'Pendências de entrega após recebimento parcial',
            permission: isAdministrator || can(pk('/ponto/furo-estoque'))
          },
          {
            name: 'Ajuste de Estoque',
            href: '/ponto/ajuste-estoque',
            icon: Package,
            description: 'Realizar entradas e saídas de ajuste no estoque',
            permission: isAdministrator || can(pk('/ponto/ajuste-estoque'))
          },
          {
            name: "FD's Aprovadas",
            href: '/ponto/fds-aprovadas',
            icon: ClipboardCheck,
            description: "FD's aprovadas — status de compras",
            permission:
              isAdministrator || can(pk('/ponto/fds-aprovadas'))
          },
          {
            name: 'Fila de Abastecimento',
            href: '/ponto/solicitacoes-combustivel',
            icon: Fuel,
            description: 'Pedidos de abastecimento (sistema e Gennecy)',
            permission:
              isAdministrator || can(pk('/ponto/solicitacoes-combustivel'))
          },
          {
            name: 'Gestão da Frota',
            href: '/ponto/solicitacoes-reserva-veiculos',
            icon: CalendarRange,
            description: 'Aprovar ou rejeitar solicitações de uso da frota',
            permission:
              isAdministrator || can(pk('/ponto/solicitacoes-reserva-veiculos'))
          },
          {
            name: 'Pedidos de Ferramentas',
            href: '/ponto/solicitacoes-ferramentas',
            icon: Wrench,
            description: 'Analisar solicitações de locação, renovação, devolução ou compra',
            permission:
              isAdministrator || can(pk('/ponto/solicitacoes-ferramentas'))
          },
        ]
      },
      {
        id: 'cadastros',
        name: 'Cadastros',
        icon: Database,
        items: [
          {
            name: 'Locais e Ativos',
            href: '/ponto/sistema-gestao-os/locais',
            icon: MapPin,
            description: 'Prédios, setores, salas e ativos com QR',
            permission:
              isAdministrator ||
              can(pk('/ponto/sistema-gestao-os/locais')),
            section: 'Central de Chamados'
          },
          {
            name: 'Equipamentos',
            href: '/ponto/sistema-gestao-os/equipamentos',
            icon: Boxes,
            description: 'Grupos, subgrupos e equipamentos',
            permission:
              isAdministrator ||
              can(pk('/ponto/sistema-gestao-os/equipamentos')),
            section: 'Central de Chamados'
          },
          {
            name: 'Tipos de Serviço',
            href: '/ponto/sistema-gestao-os/tipos-servico',
            icon: Wrench,
            description: 'Categorias de serviço para chamados e OS',
            permission:
              isAdministrator ||
              can(pk('/ponto/sistema-gestao-os/tipos-servico')),
            section: 'Central de Chamados'
          },
          {
            name: 'Fornecedores',
            href: '/ponto/fornecedores',
            icon: Building2,
            description: 'Cadastro de fornecedores',
            permission: isAdministrator || can(pk('/ponto/fornecedores')),
            section: 'Compras'
          },
          {
            name: 'Materiais e Serviços',
            href: '/ponto/materiais-construcao',
            icon: Package,
            description: 'Gerenciar cadastro de materiais e serviços',
            permission: isAdministrator || can(pk('/ponto/materiais-construcao')),
            section: 'Compras'
          },
          {
            name: 'Condições de Pagamento',
            href: '/ponto/condicoes-pagamento',
            icon: CreditCard,
            description: 'Condições para ordens de compra',
            permission: isAdministrator || can(pk('/ponto/condicoes-pagamento')),
            section: 'Compras'
          },
          {
            name: 'Veículos',
            href: '/ponto/veiculos',
            icon: Car,
            description: 'Cadastro de veículos da frota',
            permission: isAdministrator || can(pk('/ponto/veiculos')),
            section: 'Frota'
          },
          {
            name: 'Postos de Combustível',
            href: '/ponto/regioes-postos-combustivel',
            icon: Fuel,
            description: 'Cidades satélites e postos para abastecimento',
            permission:
              isAdministrator || can(pk('/ponto/regioes-postos-combustivel')),
            section: 'Frota'
          },
          {
            name: 'Centros de Custo',
            href: '/ponto/centros-custo',
            icon: Building2,
            description: 'Gerenciar centros de custo',
            permission: isAdministrator || can(pk('/ponto/centros-custo')),
            section: 'Financeiro'
          },
          {
            name: 'Natureza Orçamentária',
            href: '/ponto/natureza-orcamentaria',
            icon: BookPlus,
            description: 'Cadastrar naturezas orçamentárias',
            permission: isAdministrator || can(pk('/ponto/natureza-orcamentaria')),
            section: 'Financeiro'
          },
          {
            name: 'Prestadores de Serviço',
            href: '/ponto/prestadores-servico',
            icon: Truck,
            description: 'Cadastro de prestadores para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/prestadores-servico')),
            section: 'Nota Fiscal'
          },
          {
            name: 'Tomadores de Serviço',
            href: '/ponto/tomadores-servico',
            icon: Contact,
            description: 'Cadastro de tomadores para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/tomadores-servico')),
            section: 'Nota Fiscal'
          },
          {
            name: 'Contas Bancárias',
            href: '/ponto/contas-bancarias',
            icon: Landmark,
            description: 'Contas usadas em tomadores e no espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/contas-bancarias')),
            section: 'Nota Fiscal'
          },
          {
            name: 'Códigos Tributários',
            href: '/ponto/codigos-tributarios',
            icon: Percent,
            description: 'Parâmetros por município para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/codigos-tributarios')),
            section: 'Nota Fiscal'
          },
          {
            name: 'Formulários',
            href: '/ponto/formularios',
            icon: ClipboardList,
            description: 'Criar e editar estrutura de formulários',
            permission: isAdministrator || can(pk('/ponto/formularios')),
            section: 'Geral'
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
            permission: (isAdministrator || permissions.canRegisterTime) && requiresTimeClock
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

    return filteredCategories.map((category) => ({
      ...category,
      items: sortNavItemsByName(category.items as SidebarNavItem[]),
    }));
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
        pathname.startsWith('/ponto/contratos/socios') ||
        pathname.startsWith('/ponto/contratos/gastos-operacionais')
      ) {
        return false;
      }
      // Detalhe do contrato e subpáginas (orçamento, permissões, etc.)
      return /^\/ponto\/contratos\/[^/]+/.test(pathname);
    }
    if (href === '/ponto/funcionarios') {
      return pathname === href || pathname.startsWith(`${href}/`);
    }

    return pathname === href;
  };

  const renderSidebarNavItem = (item: SidebarNavItem, forceExpanded: boolean, navIndex = 0) => {
    const ItemIcon = item.icon;
    const visibleChildren = item.children?.filter((child) => child.permission) ?? [];
    const groupKey = item.name;
    const wrapStyle = { ['--nav-i' as string]: navIndex } as React.CSSProperties;

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
        <div key={`group-${groupKey}`} className="sidebar-nav-item-wrap space-y-1" style={wrapStyle}>
          <button
            type="button"
            onClick={() => {
              if (forceExpanded) return;
              setExpandedNavGroups((prev) => ({
                ...prev,
                [groupKey]: !expanded,
              }));
            }}
            className={`sidebar-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 ${
              childActive
                ? 'sidebar-nav-item--active bg-red-50/70 text-red-700 dark:bg-red-900/10 dark:text-red-500'
                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
            aria-expanded={expanded}
          >
            <ItemIcon
              className={`sidebar-nav-item__icon h-4 w-4 flex-shrink-0 ${
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
              {visibleChildren.map((child, childIndex) => {
                const active = isActive(child.href);
                const badgeCount = navBadgeCountForHref(child.href);
                return (
                  <div
                    key={child.href}
                    className="sidebar-nav-item-wrap"
                    style={{ ['--nav-i' as string]: navIndex + childIndex * 0.35 } as React.CSSProperties}
                  >
                    <Link
                      href={resolveNavHref(child.href)}
                      prefetch={navLinkPrefetch}
                      onMouseEnter={navDataPrefetchForHref(child.href)}
                      onClick={(event) => {
                        if (!active) return;
                        event.preventDefault();
                        bumpNavPop(child.href);
                        dispatchReplayPageEnter();
                      }}
                      className={`sidebar-nav-item flex items-center gap-3 rounded-xl px-3 py-2 ${
                        active
                          ? `sidebar-nav-item--active bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-500${
                              navPopHref === child.href ? ' sidebar-nav-item--pop' : ''
                            }`
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{child.name}</span>
                      <NotificationCountBadge count={badgeCount} />
                    </Link>
                  </div>
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
      <div key={item.href} className="sidebar-nav-item-wrap" style={wrapStyle}>
        <Link
          href={resolveNavHref(item.href)}
          prefetch={navLinkPrefetch}
          onMouseEnter={navDataPrefetchForHref(item.href)}
          onClick={(event) => {
            if (!active) return;
            event.preventDefault();
            bumpNavPop(item.href);
            dispatchReplayPageEnter();
          }}
          className={`sidebar-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 ${
            active
              ? `sidebar-nav-item--active bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-500${
                  navPopHref === item.href ? ' sidebar-nav-item--pop' : ''
                }`
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
        >
          <ItemIcon
            className={`sidebar-nav-item__icon h-4 w-4 flex-shrink-0 ${
              active ? 'text-red-600 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'
            }`}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
          <NotificationCountBadge count={badgeCount} />
        </Link>
      </div>
    );
  };

  const renderNavItemList = (items: SidebarNavItem[], forceExpanded: boolean) => {
    const visible = items.filter(navItemIsVisible);
    const groups = groupNavItemsBySection(visible);
    const useHeaders = groups.some((group) => group.title);
    if (!useHeaders) {
      return visible.map((item, index) => renderSidebarNavItem(item, forceExpanded, index));
    }
    let navI = 0;
    return (
      <div className="space-y-5">
        {groups.map((group, groupIndex) => {
          const titleIndex = group.title ? navI++ : 0;
          return (
            <div key={group.title ?? `geral-${groupIndex}`} className="space-y-3">
              {group.title ? (
                <p
                  className="sidebar-nav-section-title whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                  style={{ ['--nav-i' as string]: titleIndex } as React.CSSProperties}
                >
                  {group.title}
                </p>
              ) : null}
              {group.items.map((item) =>
                renderSidebarNavItem(item, forceExpanded, navI++)
              )}
            </div>
          );
        })}
      </div>
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

  /** Anima entrada só ao abrir o painel ou trocar de módulo — nunca ao navegar entre páginas. */
  const [navEnterClass, setNavEnterClass] = useState(false);
  const [railEnterClass, setRailEnterClass] = useState(false);
  /** Borda do painel: permanece durante o fechamento e some só no fim da animação. */
  const [tier2BorderVisible, setTier2BorderVisible] = useState(false);
  const [railPop, setRailPop] = useState<{ id: string; n: number }>({ id: '', n: 0 });
  const [navPopHref, setNavPopHref] = useState('');
  const railPopRafRef = useRef<number | null>(null);
  const navPopRafRef = useRef<number | null>(null);
  const navEnterTimeoutRef = useRef<number | null>(null);
  const railEnterTimeoutRef = useRef<number | null>(null);
  const railEnterPlayedRef = useRef(false);
  const tier2BorderHideTimeoutRef = useRef<number | null>(null);

  const bumpRailPop = useCallback((id: string) => {
    if (railPopRafRef.current != null) cancelAnimationFrame(railPopRafRef.current);
    setRailPop({ id, n: 0 });
    railPopRafRef.current = requestAnimationFrame(() => {
      railPopRafRef.current = requestAnimationFrame(() => {
        setRailPop({ id, n: Date.now() });
        railPopRafRef.current = null;
      });
    });
  }, []);

  const bumpNavPop = useCallback((href: string) => {
    if (navPopRafRef.current != null) cancelAnimationFrame(navPopRafRef.current);
    setNavPopHref('');
    navPopRafRef.current = requestAnimationFrame(() => {
      navPopRafRef.current = requestAnimationFrame(() => {
        setNavPopHref(href);
        navPopRafRef.current = null;
      });
    });
  }, []);

  const replayNavEnter = useCallback(() => {
    setNavEnterClass(false);
    requestAnimationFrame(() => setNavEnterClass(true));
    if (navEnterTimeoutRef.current != null) window.clearTimeout(navEnterTimeoutRef.current);
    navEnterTimeoutRef.current = window.setTimeout(() => {
      setNavEnterClass(false);
      navEnterTimeoutRef.current = null;
    }, 700);
  }, []);

  const isRailPopping = (id: string) => railPop.id === id && railPop.n > 0;

  const prevNavModuleRef = useRef(displayedModuleId);
  const prevTier2VisibleRef = useRef(tier2Visible);
  useEffect(() => {
    const moduleChanged = prevNavModuleRef.current !== displayedModuleId;
    const justOpened = !prevTier2VisibleRef.current && tier2Visible;
    prevNavModuleRef.current = displayedModuleId;
    prevTier2VisibleRef.current = tier2Visible;

    if (!tier2Visible || (!moduleChanged && !justOpened)) return;

    replayNavEnter();
    return () => {
      if (navEnterTimeoutRef.current != null) {
        window.clearTimeout(navEnterTimeoutRef.current);
        navEnterTimeoutRef.current = null;
      }
    };
  }, [displayedModuleId, tier2Visible, replayNavEnter]);

  /** Rail: stagger uma vez quando os módulos carregam (entrada no sistema). */
  useEffect(() => {
    if (!sidebarHydrated) return;
    if (isLoading && menuItems.length === 0) return;
    if (railEnterPlayedRef.current) return;
    if (menuItems.length === 0 && !canAccessCollaborationTools) return;

    railEnterPlayedRef.current = true;
    setRailEnterClass(false);
    const raf = requestAnimationFrame(() => setRailEnterClass(true));
    if (railEnterTimeoutRef.current != null) window.clearTimeout(railEnterTimeoutRef.current);
    railEnterTimeoutRef.current = window.setTimeout(() => {
      setRailEnterClass(false);
      railEnterTimeoutRef.current = null;
    }, 1000);

    return () => {
      cancelAnimationFrame(raf);
      if (railEnterTimeoutRef.current != null) {
        window.clearTimeout(railEnterTimeoutRef.current);
        railEnterTimeoutRef.current = null;
      }
    };
  }, [sidebarHydrated, isLoading, menuItems.length, canAccessCollaborationTools]);

  useLayoutEffect(() => {
    if (tier2BorderHideTimeoutRef.current != null) {
      window.clearTimeout(tier2BorderHideTimeoutRef.current);
      tier2BorderHideTimeoutRef.current = null;
    }

    if (tier2Visible) {
      setTier2BorderVisible(true);
      return;
    }

    // Mantém a borda enquanto a largura anima; só remove após o duration-500.
    if (!sidebarHydrated) {
      setTier2BorderVisible(false);
      return;
    }

    tier2BorderHideTimeoutRef.current = window.setTimeout(() => {
      setTier2BorderVisible(false);
      tier2BorderHideTimeoutRef.current = null;
    }, SIDEBAR_TRANSITION_MS);

    return () => {
      if (tier2BorderHideTimeoutRef.current != null) {
        window.clearTimeout(tier2BorderHideTimeoutRef.current);
        tier2BorderHideTimeoutRef.current = null;
      }
    };
  }, [tier2Visible, sidebarHydrated]);

  /** Rail: painel aberto → módulo exibido; recolhido → rota ativa; na home recolhida → nenhum (só logo) */
  const railModuleActiveId: string | null = tier2Visible
    ? displayedModuleId
    : activeModuleId ?? (onHomeRoute || onRailFooterRoute ? null : displayedModuleId);

  useEffect(() => {
    if (railModuleActiveId) {
      bumpRailPop(railModuleActiveId);
      return;
    }
    if (isFooterShortcutActive('/ponto/conversas')) bumpRailPop('footer:conversas');
    else if (isFooterShortcutActive('/ponto/kanban')) bumpRailPop('footer:kanban');
    else if (isFooterShortcutActive('/ponto/agenda')) bumpRailPop('footer:agenda');
    else if (isFooterShortcutActive('/ponto/flow')) bumpRailPop('footer:flow');
    else if (isFooterShortcutActive('/ponto/drive')) bumpRailPop('footer:drive');
  }, [railModuleActiveId, pathname, bumpRailPop]);

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

  const expandSidebarPanel = useCallback(() => {
    setCollapsed(false);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setIsOpen(true);
    }
  }, [setCollapsed]);

  useEffect(() => {
    const onToggle = () => {
      if (isCollapsed) expandSidebarPanel();
      else closeSidebarPanel();
    };
    const onExpand = () => expandSidebarPanel();
    const onOpenMobile = () => {
      window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.CLOSE_PROFILE_MENU));
      setIsOpen(true);
    };
    const onCloseMobile = () => setIsOpen(false);
    const onSetSearch = (event: Event) => {
      const detail = (event as CustomEvent<MenuSearchDetail>).detail;
      const term = detail?.term ?? '';
      setSearchTerm(term);
      if (term.trim()) expandSidebarPanel();
    };

    window.addEventListener(LAYOUT_CHROME.TOGGLE_SIDEBAR, onToggle);
    window.addEventListener(LAYOUT_CHROME.EXPAND_SIDEBAR, onExpand);
    window.addEventListener(LAYOUT_CHROME.OPEN_MOBILE_SIDEBAR, onOpenMobile);
    window.addEventListener(LAYOUT_CHROME.CLOSE_MOBILE_SIDEBAR, onCloseMobile);
    window.addEventListener(LAYOUT_CHROME.SET_MENU_SEARCH, onSetSearch);
    return () => {
      window.removeEventListener(LAYOUT_CHROME.TOGGLE_SIDEBAR, onToggle);
      window.removeEventListener(LAYOUT_CHROME.EXPAND_SIDEBAR, onExpand);
      window.removeEventListener(LAYOUT_CHROME.OPEN_MOBILE_SIDEBAR, onOpenMobile);
      window.removeEventListener(LAYOUT_CHROME.CLOSE_MOBILE_SIDEBAR, onCloseMobile);
      window.removeEventListener(LAYOUT_CHROME.SET_MENU_SEARCH, onSetSearch);
    };
  }, [closeSidebarPanel, expandSidebarPanel, isCollapsed]);

  // Ao mudar de rota: fecha drawer mobile; recolhe painel só em home/atalhos do rodapé
  React.useEffect(() => {
    if (pathname === prevPathnameRef.current) return;
    prevPathnameRef.current = pathname;
    userPickedModuleRef.current = false;
    setSearchTerm('');
    setIsOpen(false);

    if (onHomeRoute || onRailFooterRoute) {
      setCollapsed(true);
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
      bumpRailPop(categoryId);
      closeSidebarPanel();
      return;
    }
    bumpRailPop(categoryId);
    userPickedModuleRef.current = true;
    setSelectedModuleId(categoryId);
    if (isCollapsed) setCollapsed(false);
  };

  // Fecha o painel ao clicar fora da sidebar no desktop (mobile usa o overlay)
  React.useEffect(() => {
    if (effectiveCollapsed) return;
    if (searchTerm.trim()) return;

    const handlePointerDown = (event: PointerEvent) => {
      const sidebarEl = sidebarRef.current;
      if (!sidebarEl) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (sidebarEl.contains(target)) return;
      if (target instanceof Element && target.closest('[data-app-topnav]')) return;
      closeSidebarPanel();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [effectiveCollapsed, closeSidebarPanel, searchTerm]);

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

    const forceCollapsed = shouldForceSidebarCollapsed(pathname);
    const collapsed = forceCollapsed || readSidebarCollapsed();
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
      {/* Overlay mobile — acima da TopNavbar para bloquear cliques com o menu aberto */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
          onClick={closeSidebarPanel}
          aria-hidden
        />
      )}

      {/* Dual-tier Sidebar */}
      <div
        ref={sidebarRef}
        data-app-sidebar
        className={`fixed inset-y-0 left-0 z-[70] flex h-[100dvh] max-h-[100dvh] overflow-y-clip overflow-x-visible transition-all ${SIDEBAR_TRANSITION_CLASS} ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Tier 1 — Rail de módulos */}
        <div
          className={`flex h-full min-h-0 w-20 flex-shrink-0 flex-col overflow-x-visible overflow-y-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900${
            railEnterClass ? ' sidebar-rail-list--enter' : ''
          }`}
        >
          <div className="relative z-0 isolate flex flex-shrink-0 flex-col items-center p-5 pb-3 [@media(max-height:820px)]:p-2.5 [@media(max-height:820px)]:pb-1.5">
            <div
              className="sidebar-rail-enter-item"
              style={{ ['--rail-i' as string]: 0 } as React.CSSProperties}
            >
            <Link
              href="/ponto/home"
              prefetch={navLinkPrefetch}
              className="sidebar-logo-btn flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8"
              title="Ir para a página inicial"
              aria-label="Página inicial"
              aria-current={onHomeRoute ? 'page' : undefined}
            >
              <img
                src={logoSrc}
                alt={logoAlt}
                className="sidebar-logo-btn__img h-full w-full object-contain"
              />
            </Link>
            </div>
          </div>

          {/* pt reserva a folga que o badge do primeiro ícone ocupa acima do botão: como o nav
              rola, qualquer coisa acima do topo do conteúdo é cortada. */}
          <nav className="scrollbar-hide relative z-30 min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pb-4 pt-3 [@media(max-height:820px)]:space-y-1 [@media(max-height:820px)]:px-1.5 [@media(max-height:820px)]:pb-2">
            {sidebarHydrated && (!isLoading || menuItems.length > 0) ? menuItems.map((category, railIndex) => {
              const CategoryIcon = category.icon;
              const isRailActive = category.id === railModuleActiveId;
              const visibleItems = category.items.filter((item) =>
                navItemIsVisible(item as SidebarNavItem),
              );
              const forceAsGroup = !(category as { preferDirectLink?: boolean }).preferDirectLink;
              const isSingleItem = visibleItems.length === 1 && !forceAsGroup;
              const singleItem = isSingleItem ? visibleItems[0] : null;
              const enterIndex = railIndex + 1;

              if (isSingleItem && singleItem) {
                const active = isActive(singleItem.href);
                const SingleItemIcon = singleItem.icon || CategoryIcon;
                const singleBadge = navBadgeCountForHref(singleItem.href);
                return (
                  <SidebarRailTooltip key={category.id} label={singleItem.name} enterIndex={enterIndex}>
                    <Link
                      href={singleItem.href}
                      prefetch={navLinkPrefetch}
                      onClick={(event) => {
                        if (!active) return;
                        event.preventDefault();
                        bumpRailPop(category.id);
                        dispatchReplayPageEnter();
                      }}
                      className={`sidebar-rail-btn relative z-10 flex h-10 w-10 items-center justify-center overflow-visible rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                        active
                          ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                              isRailPopping(category.id) ? ' sidebar-rail-btn--pop' : ''
                            }`
                          : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`}
                      aria-label={singleItem.name}
                      aria-current={active ? 'page' : undefined}
                    >
                      <SingleItemIcon className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                      <NotificationCountBadge count={singleBadge} rail />
                    </Link>
                  </SidebarRailTooltip>
                );
              }

              const moduleBadge = moduleBadgeCountForVisibleItems(visibleItems);
              return (
                <SidebarRailTooltip key={category.id} label={category.name} enterIndex={enterIndex}>
                  <button
                    type="button"
                    onClick={() => handleSelectModule(category.id)}
                    className={`sidebar-rail-btn relative z-10 flex h-10 w-10 items-center justify-center overflow-visible rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                      isRailActive
                        ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                            isRailPopping(category.id) ? ' sidebar-rail-btn--pop' : ''
                          }`
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                    aria-label={category.name}
                    aria-current={isRailActive ? 'true' : undefined}
                  >
                    <CategoryIcon className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
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

          {/* Rodapé: atalhos (ocultos para setor Sócios) */}
          {canAccessCollaborationTools ? (
          <div className="relative z-20 flex flex-shrink-0 flex-col items-center overflow-visible px-2 pb-4 [@media(max-height:820px)]:pb-2">
            <div className="flex flex-col items-center gap-2 [@media(max-height:820px)]:gap-1">
              <SidebarRailTooltip label="Conversas" enterIndex={menuItems.length + 1}>
                <Link
                  href="/ponto/conversas"
                  prefetch={navLinkPrefetch}
                  aria-label={`Conversas${chatUnreadCount > 0 ? `, ${chatUnreadCount} não lidas` : ''}`}
                  aria-current={isFooterShortcutActive('/ponto/conversas') ? 'page' : undefined}
                  onClick={(event) => {
                    if (!isFooterShortcutActive('/ponto/conversas')) return;
                    event.preventDefault();
                    bumpRailPop('footer:conversas');
                    dispatchReplayPageEnter();
                  }}
                  className={`sidebar-rail-btn relative flex h-10 w-10 items-center justify-center overflow-visible rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/conversas')
                      ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                          isRailPopping('footer:conversas') ? ' sidebar-rail-btn--pop' : ''
                        }`
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <MessageCircle className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                  <NotificationCountBadge count={chatUnreadCount} rail />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Tasks" enterIndex={menuItems.length + 2}>
                <Link
                  href="/ponto/kanban"
                  prefetch={navLinkPrefetch}
                  aria-label="Tasks"
                  aria-current={isFooterShortcutActive('/ponto/kanban') ? 'page' : undefined}
                  onClick={(event) => {
                    if (!isFooterShortcutActive('/ponto/kanban')) return;
                    event.preventDefault();
                    bumpRailPop('footer:kanban');
                    dispatchReplayPageEnter();
                  }}
                  className={`sidebar-rail-btn flex h-10 w-10 items-center justify-center rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/kanban')
                      ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                          isRailPopping('footer:kanban') ? ' sidebar-rail-btn--pop' : ''
                        }`
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <SquareKanban className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Agenda" enterIndex={menuItems.length + 3}>
                <Link
                  href="/ponto/agenda"
                  prefetch={navLinkPrefetch}
                  aria-label="Agenda"
                  aria-current={isFooterShortcutActive('/ponto/agenda') ? 'page' : undefined}
                  onClick={(event) => {
                    if (!isFooterShortcutActive('/ponto/agenda')) return;
                    event.preventDefault();
                    bumpRailPop('footer:agenda');
                    dispatchReplayPageEnter();
                  }}
                  className={`sidebar-rail-btn flex h-10 w-10 items-center justify-center rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/agenda')
                      ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                          isRailPopping('footer:agenda') ? ' sidebar-rail-btn--pop' : ''
                        }`
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <CalendarRange className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Flow" enterIndex={menuItems.length + 4}>
                <Link
                  href="/ponto/flow"
                  prefetch={navLinkPrefetch}
                  aria-label="Flow"
                  aria-current={isFooterShortcutActive('/ponto/flow') ? 'page' : undefined}
                  onClick={(event) => {
                    if (!isFooterShortcutActive('/ponto/flow')) return;
                    event.preventDefault();
                    bumpRailPop('footer:flow');
                    dispatchReplayPageEnter();
                  }}
                  className={`sidebar-rail-btn flex h-10 w-10 items-center justify-center rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/flow')
                      ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                          isRailPopping('footer:flow') ? ' sidebar-rail-btn--pop' : ''
                        }`
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <Workflow className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
              <SidebarRailTooltip label="Drive" enterIndex={menuItems.length + 5}>
                <Link
                  href="/ponto/drive"
                  prefetch={navLinkPrefetch}
                  aria-label="Drive"
                  aria-current={isFooterShortcutActive('/ponto/drive') ? 'page' : undefined}
                  onClick={(event) => {
                    if (!isFooterShortcutActive('/ponto/drive')) return;
                    event.preventDefault();
                    bumpRailPop('footer:drive');
                    dispatchReplayPageEnter();
                  }}
                  className={`sidebar-rail-btn flex h-10 w-10 items-center justify-center rounded-xl [@media(max-height:820px)]:h-8 [@media(max-height:820px)]:w-8 ${
                    isFooterShortcutActive('/ponto/drive')
                      ? `sidebar-rail-btn--active bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500${
                          isRailPopping('footer:drive') ? ' sidebar-rail-btn--pop' : ''
                        }`
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <HardDrive className="sidebar-rail-btn__icon h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4" />
                </Link>
              </SidebarRailTooltip>
            </div>
          </div>
          ) : null}
        </div>

        {/* Tier 2 — Painel de páginas do módulo */}
        <div
          className={`flex h-full min-h-0 flex-shrink-0 flex-col overflow-hidden bg-white dark:bg-gray-900 ${
            sidebarHydrated ? `transition-[width,opacity] ${SIDEBAR_TRANSITION_CLASS}` : 'transition-none'
          } ${tier2Visible ? 'w-72 opacity-100' : 'w-0 opacity-100 pointer-events-none'} ${
            tier2BorderVisible
              ? 'border-r border-gray-200 dark:border-gray-800'
              : 'border-r-0'
          }`}
        >
          {/* Largura fixa: o painel só revela o conteúdo, sem o texto refluir no meio da abertura. */}
          <div className="flex h-full min-h-0 w-72 shrink-0 flex-col">
          {/* Header do módulo — mesma altura da TopNavbar (h-16) pra linha bater */}
          <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-5 dark:border-gray-800">
            <div className="flex w-full items-center justify-between gap-2">
              <h2 className="truncate text-lg font-semibold leading-snug text-gray-900 dark:text-gray-100">
                {searchTerm.trim() ? 'Busca' : selectedModule?.name ?? 'Menu'}
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={handleCollapseSidebar}
                  className="hidden h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors duration-200 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 lg:flex"
                  title="Recolher menu"
                >
                  <ArrowLeftToLine className="h-5 w-5 flex-shrink-0" />
                </button>
                <button
                  onClick={closeSidebarPanel}
                  className="flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
                  aria-label="Fechar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Lista de páginas */}
          <nav
            className={`sidebar-nav-list min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4${
              navEnterClass ? ' sidebar-nav-list--enter' : ''
            }`}
          >
            {sidebarHydrated && (!isLoading || menuItems.length > 0) ? searchTerm.trim() ? (
              menuItems.map((category) => {
                const filteredItems = (category.items as SidebarNavItem[]).filter(navItemIsVisible);
                if (filteredItems.length === 0) return null;
                return (
                  <div key={category.id} className="mb-4">
                    <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {category.name}
                    </p>
                    {renderNavItemList(filteredItems, true)}
                  </div>
                );
              })
            ) : (
              renderNavItemList(
                (selectedModule?.items ?? []) as SidebarNavItem[],
                false
              )
            ) : null}
          </nav>
          </div>
        </div>
      </div>
    </>
  );
}
