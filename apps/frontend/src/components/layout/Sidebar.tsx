'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { CircularPhotoCropModal } from '@/components/conversas/CircularPhotoCropModal';
import { 
  Home, 
  Users, 
  Clock, 
  LogOut, 
  Menu, 
  X,
  User,
  PanelRightOpen,
  PanelLeftOpen,
  ChevronDown,
  ChevronUp,
  Lock,
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
  CalendarX2,
  MailPlus,
  Moon,
  Sun,
  AlertCircle,
  MessageSquare,
  FileCheck,
  DollarSign,
  Package,
  ShoppingCart,
  Building2,
  Cake,
  Calculator,
  ClipboardList,
  CreditCard,
  HardDrive,
  Image as ImageIcon,
  Camera,
  PencilLine,
  Trash2,
  Loader2
} from 'lucide-react';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';

const pk = pathToModuleKey;
import { useTheme } from '@/context/ThemeContext';

interface SidebarProps {
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
  onMenuToggle?: (collapsed: boolean) => void;
}

export function Sidebar({ userRole, userName, onLogout, onMenuToggle }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Carregar estado do localStorage no carregamento inicial
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showButtonText, setShowButtonText] = useState(!isCollapsed);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const pathname = usePathname();
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
    canAccessOsRoutePage,
  } = usePermissions();
  const { theme, toggleTheme, isDark } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarSectionRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [profileAvatarMenu, setProfileAvatarMenu] = useState(false);
  const [profilePhotoViewer, setProfilePhotoViewer] = useState(false);
  const [profileCropSrc, setProfileCropSrc] = useState<string | null>(null);
  
  // Verificar se é administrador
  const isAdministrator = userPosition === 'Administrador';
  
  // Verificar se o funcionário precisa bater ponto
  const requiresTimeClock = user?.employee?.requiresTimeClock !== false;
  
  // Verificar se é do departamento Compras
  const isDepartmentCompras = userDepartment?.toLowerCase().includes('compras');
  
  // Verificar se é do departamento Financeiro
  const isDepartmentFinanceiro = userDepartment?.toLowerCase().includes('financeiro');

  const handleLogout = () => {
    setShowUserMenu(false);
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
      setProfilePhotoViewer(false);
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
      if (menuRef.current?.contains(t)) return;
      setShowUserMenu(false);
      setProfileAvatarMenu(false);
    };

    if (showUserMenu || profileAvatarMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu, profileAvatarMenu]);

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
            name: 'Painel de solicitações',
            href: '/ponto/financeiro/gestao-solicitacoes',
            icon: BarChart3,
            description: 'Solicitações do Fluig na visão financeira',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/gestao-solicitacoes'))
          },
          {
            name: 'Meu Drive',
            href: '/ponto/drive',
            icon: HardDrive,
            description: 'Armazenamento de arquivos na nuvem',
            permission: true
          },
          {
            name: 'Central de Atendimentos',
            href: '/ponto/conversas-whatsapp',
            icon: MessageSquare,
            description: 'Conversas do chatbot WhatsApp para o pessoal ver',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/conversas-whatsapp'))
          },
          {
            name: 'Aprovações',
            href: '/ponto/aprovacoes',
            icon: FileCheck,
            description: 'Caixa de entrada de aprovações',
            permission: can(pk('/ponto/aprovacoes')) || canAccessDpApproverPages,
          }
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
            name: 'Alterações de ponto',
            href: '/ponto/solicitacoes',
            icon: MailPlus,
            description: 'Solicitar e acompanhar alterações de marcação do ponto',
            permission: isAdministrator || can(pk('/ponto/solicitacoes'))
          },
          {
            name: 'Gerenciar alterações de ponto',
            href: '/ponto/gerenciar-solicitacoes',
            icon: FileText,
            description: 'Analisar e aprovar alterações de marcação dos colaboradores',
            permission: isAdministrator || can(pk('/ponto/gerenciar-solicitacoes'))
          },
          {
            name: 'Solicitações Gerais',
            href: '/ponto/solicitacoes-gerais',
            icon: MailPlus,
            description: 'Minhas solicitações ao DP',
            permission: isAdministrator || can(pk('/ponto/solicitacoes-gerais'))
          },
          {
            name: 'Gerenciar Solicitações Gerais',
            href: '/ponto/gerenciar-solicitacoes-gerais',
            icon: FileText,
            description: 'Aprovar solicitações do DP',
            permission:
              isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-solicitacoes-gerais')),
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
        id: 'financeiro',
        name: 'Financeiro',
        icon: DollarSign,
        items: [
          {
            name: 'Financeiro',
            href: '/ponto/financeiro',
            icon: DollarSign,
            description: 'Gerar borderô e CNAB400 para pagamentos',
            permission: isAdministrator || can(pk('/ponto/financeiro'))
          },
          {
            name: 'Análise Financeira',
            href: '/ponto/financeiro/analise',
            icon: BarChart3,
            description: 'Importar planilha e gerar relatórios de análise financeira',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise'))
          }
          ,
          {
            name: 'Análise de Extrato',
            href: '/ponto/financeiro/analise-extrato',
            icon: BarChart3,
            description: 'Importar e validar extratos bancários',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise-extrato'))
          },
        ]
      },
      {
        id: 'engenharia',
        name: 'Engenharia',
        icon: Calculator,
        items: [
          {
            name: 'Contratos',
            href: '/ponto/contratos',
            icon: FileText,
            description: 'Cadastro de contratos da engenharia',
            permission: isAdministrator || can(pk('/ponto/contratos'))
          },
          {
            name: 'Controle Geral de Contratos',
            href: '/ponto/contratos/controle-geral',
            icon: LayoutDashboard,
            description: 'Visão consolidada de todos os contratos',
            permission: isAdministrator || can(pk('/ponto/contratos/controle-geral'))
          },
          {
            name: 'Ordem de Serviço',
            href: '/ponto/andamento-da-os',
            icon: ClipboardList,
            description: 'Acompanhamento e controle das ordens de serviço',
            permission: canAccessOsRoutePage
          },
          {
            name: 'Pleitos Gerados',
            href: '/ponto/pleitos-gerados',
            icon: FileCheck,
            description: 'Visualizar todos os pleitos com valor pleiteado',
            permission: isAdministrator || can(pk('/ponto/pleitos-gerados'))
          }
        ]
      },
      {
        id: 'suprimentos',
        name: 'Suprimentos',
        icon: Package,
        items: [
          {
            name: 'Solicitar Materiais',
            href: '/ponto/solicitar-materiais',
            icon: ShoppingCart,
            description: 'Solicitar materiais para compra (SC)',
            permission: isAdministrator || can(pk('/ponto/solicitar-materiais'))
          },
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
        ]
      },
      {
        id: 'cadastros',
        name: 'Cadastros',
        icon: BarChart3,
        items: [
          {
            name: 'Centros de Custo',
            href: '/ponto/centros-custo',
            icon: Building2,
            description: 'Gerenciar centros de custo',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/centros-custo'))
          },
          {
            name: 'Materiais de Construção',
            href: '/ponto/materiais-construcao',
            icon: Package,
            description: 'Gerenciar materiais de construção civil',
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
    let filteredCategories = menuCategories.filter(category => 
      category.items.some(item => item.permission)
    );

    // Aplicar filtro de pesquisa se houver termo de busca
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filteredCategories = filteredCategories
        .map(category => {
          // Filtrar itens dentro da categoria
          const filteredItems = category.items.filter(item => {
            if (!item.permission) return false;
            const matchesName = item.name.toLowerCase().includes(searchLower);
            const matchesDescription = item.description?.toLowerCase().includes(searchLower) || false;
            return matchesName || matchesDescription;
          });

          // Retornar categoria apenas se tiver itens após o filtro
          return filteredItems.length > 0 ? { ...category, items: filteredItems } : null;
        })
        .filter(category => category !== null) as typeof menuCategories;
    }

    return filteredCategories;
  };

  const menuItems = getMenuItems();

  const isActive = (href: string) => {
    if (pathname == null) return false;
    if (href === '/ponto/contratos') {
      if (pathname === '/ponto/contratos') return true;
      // Rotas fixas sob /ponto/contratos (ex.: controle geral) — não marcam "Contratos", só o item próprio.
      if (pathname.startsWith('/ponto/contratos/controle-geral')) return false;
      // Detalhe do contrato e subpáginas (orçamento, permissões, etc.)
      return /^\/ponto\/contratos\/[^/]+/.test(pathname);
    }

    return pathname === href;
  };

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(menuId)) {
        newSet.delete(menuId);
      } else {
        newSet.add(menuId);
      }
      return newSet;
    });
  };

  const isMenuExpanded = (menuId: string) => {
    return expandedMenus.has(menuId);
  };

  // Expandir automaticamente grupos com páginas ativas na inicialização
  React.useEffect(() => {
    const activeCategories = menuItems.filter(category => 
      category.items.some(item => isActive(item.href))
    );
    
    if (activeCategories.length > 0) {
      const newExpandedMenus = new Set(expandedMenus);
      activeCategories.forEach(category => {
        newExpandedMenus.add(category.id);
      });
      setExpandedMenus(newExpandedMenus);
    }
  }, [pathname]); // Executa quando a rota muda

  // Expandir automaticamente todos os grupos quando houver pesquisa
  React.useEffect(() => {
    if (searchTerm.trim()) {
      const allCategoryIds = menuItems.map(category => category.id);
      setExpandedMenus(new Set(allCategoryIds));
    }
  }, [searchTerm]); // Executa quando o termo de pesquisa muda

  // Salvar estado no localStorage sempre que mudar
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
    }
  }, [isCollapsed]);

  // Notificar o MainLayout sobre mudanças no estado do menu
  React.useEffect(() => {
    if (onMenuToggle) {
      onMenuToggle(isCollapsed);
    }
  }, [isCollapsed, onMenuToggle]);

  // Controlar quando mostrar o texto dos botões
  React.useEffect(() => {
    setShowButtonText(!isCollapsed);
  }, [isCollapsed]);

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
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-all duration-500 ease-in-out z-40 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:fixed ${
          isCollapsed ? 'w-20' : 'w-72'
        } flex flex-col ${isCollapsed ? 'overflow-visible' : 'overflow-x-hidden overflow-y-visible'}`}
      >
        {/* Header */}
        <div className={`${isCollapsed ? 'p-4' : 'p-4'} overflow-hidden`}>
          <div className={`flex items-center overflow-hidden ${
            isCollapsed ? 'flex-col justify-center space-y-3' : 'justify-between'
          }`}>
            {isCollapsed ? (
              /* Quando colapsada: logo acima do botão */
              <>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                  <img src="/loogo.png" alt="Logo Gennesis" className="w-12 h-12 object-contain" />
                </div>
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8"
                  title="Expandir menu"
                >
                  <PanelLeftOpen className="w-5 h-5 flex-shrink-0" />
                </button>
              </>
            ) : (
              /* Quando expandida: logo e texto à esquerda, botão à direita */
              <>
                <div className="flex items-center space-x-3 transition-opacity duration-500 ease-in-out">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                    <img src="/loogo.png" alt="Logo Gennesis" className="w-12 h-12 object-contain" />
                  </div>
                  <div className="transition-all duration-500 ease-in-out">
                    <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-all duration-500">Gennesis</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 transition-all duration-500">Attendance</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8"
                    title="Colapsar menu"
                  >
                    <PanelRightOpen className="w-5 h-5 flex-shrink-0" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="lg:hidden w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        {!isCollapsed ? (
          <div className="px-4">
            <div className="relative flex items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mt-2 mb-2 text-sm w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4">
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setIsCollapsed(false);
                  // Focar no input após a sidebar abrir (aguardar a transição)
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 300);
                }}
                className="w-10 h-10 rounded-xl bg-white hover:bg-gray-200 hover:text-gray-400 dark:bg-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent"
                title="Buscar"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 space-y-2 p-4 ${isCollapsed ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden'}`}>
          {(() => {
            return menuItems.map((category, index) => {
            const CategoryIcon = category.icon;
            const hasActiveItem = category.items.some(item => isActive(item.href));
            const isExpanded = isMenuExpanded(category.id);
            const visibleItems = category.items.filter(item => item.permission);
            // Sempre mostrar todas as categorias como grupo expansível (título + subitens),
            // mesmo quando só resta 1 item permitido para o usuário.
            const forceAsGroup = true;
            const isSingleItem = visibleItems.length === 1 && !forceAsGroup;
            const singleItem = isSingleItem ? visibleItems[0] : null;
            
            // Mostrar o título "Menu" sempre no topo da navegação visível.
            const shouldShowMenuTitle = index === 0 && !isCollapsed;
            
            // Se tiver apenas um item, renderizar como link direto
            if (isSingleItem && singleItem) {
              
              const active = isActive(singleItem.href);
              const SingleItemIcon = singleItem.icon || CategoryIcon;
              
              return (
                <div key={category.id}>
                  {shouldShowMenuTitle && (
                    <div className="px-3 pt-2 pb-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Menu</p>
                    </div>
                  )}
                  <div className={`${isCollapsed ? 'space-y-2' : 'space-y-1'}`}>
                    {isCollapsed ? (
                      <div className="flex justify-center">
                        <Link
                          href={singleItem.href}
                          onClick={() => setIsOpen(false)}
                          className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                            active 
                              ? 'text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                          title={singleItem.name}
                        >
                          <SingleItemIcon className="w-5 h-5" />
                        </Link>
                      </div>
                    ) : (
                      <Link
                        href={singleItem.href}
                        onClick={() => setIsOpen(false)}
                        className={`w-full flex items-center space-x-2 rounded-xl transition-all duration-200 overflow-hidden ${
                          active 
                            ? 'text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="rounded-xl transition-all duration-200 p-3">
                          <SingleItemIcon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`text-sm font-medium whitespace-nowrap ${active ? 'text-red-700 dark:text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>{singleItem.name}</p>
                        </div>
                      </Link>
                    )}
                  </div>
                </div>
              );
            }
            
            return (
              <div key={category.id} className="overflow-hidden">
                {/* Título "Menu" no topo da navegação */}
                {shouldShowMenuTitle && (
                  <div className="px-3 pt-2 pb-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Menu</p>
                  </div>
                )}
                {/* Separador entre grupos */}
                
                <div className={`${isCollapsed ? 'space-y-2' : 'space-y-1'} overflow-hidden`}>
                {/* Categoria Header */}
                {isCollapsed ? (
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        // Abrir a sidebar e expandir o grupo
                        setIsCollapsed(false);
                        setExpandedMenus(prev => {
                          const newSet = new Set(prev);
                          newSet.add(category.id);
                          return newSet;
                        });
                      }}
                        className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                          hasActiveItem 
                            ? 'text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      title={category.name}
                    >
                      <CategoryIcon className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleMenu(category.id)}
                    className={`w-full flex items-center space-x-2 rounded-xl transition-all duration-200 overflow-hidden ${
                      hasActiveItem 
                        ? 'text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="rounded-xl transition-all duration-200 p-3">
                      <CategoryIcon className={`w-5 h-5 flex-shrink-0 ${hasActiveItem ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0 text-left overflow-hidden">
                        <p className={`text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis ${hasActiveItem ? 'text-red-700 dark:text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>{category.name}</p>
                    </div>
                    {category.items.filter(item => item.permission).length > 0 && (
                      <div className="flex-shrink-0 pr-3">
                        {isExpanded ? (
                          <ChevronUp className={`w-4 h-4 ${hasActiveItem ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                        ) : (
                          <ChevronDown className={`w-4 h-4 ${hasActiveItem ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                        )}
                      </div>
                    )}
                  </button>
                )}

                {/* Submenu Items */}
                {isExpanded && !isCollapsed && (
                  <div className="relative ml-6 pl-4 border-l border-gray-300 dark:border-gray-700 space-y-2">
                    {category.items
                      .filter(item => item.permission)
                      .map((item) => {
                        const active = isActive(item.href);
            
                        return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                            className={`flex items-center px-3 py-2 rounded-xl transition-all duration-200 overflow-hidden ${
                              active
                                ? 'text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <p className={`text-sm font-medium ${active ? '' : 'text-gray-700 dark:text-gray-300'}`}>{item.name}</p>
              </Link>
                        );
                      })}
                  </div>
                )}
                </div>
              </div>
            );
            });
          })()}
        </nav>

        {/* Perfil do usuário */}
        <div className="flex-shrink-0 relative z-20 overflow-visible">
          {/* Linha separadora acima do perfil */}
          <div className="mx-4">
            <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
          </div>
          
          <div className="relative" ref={menuRef}>
            {/* Seção de perfil - sempre visível quando expandida */}
            <div className="bg-white dark:bg-gray-900">
              <div className={`${isCollapsed ? 'p-2' : 'p-4'}`}>
                <div
                  className={
                    isCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center space-x-3'
                  }
                >
                  {/* Foto — menu como no grupo (Conversas) */}
                  <div className={`flex-shrink-0 relative ${!isCollapsed ? '' : ''}`}>
                    <div ref={profileAvatarSectionRef}>
                      <button
                        type="button"
                        aria-haspopup="true"
                        aria-expanded={profileAvatarMenu}
                        aria-label="Opções da foto de perfil"
                        onClick={() => setProfileAvatarMenu((v) => !v)}
                        className="group relative block rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      >
                        <div
                          className={`${
                            isCollapsed ? 'w-11 h-11' : 'w-11 h-11'
                          } rounded-full overflow-hidden bg-red-600 flex items-center justify-center relative`}
                        >
                          {profilePhotoHref ? (
                            <img
                              src={profilePhotoHref}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span
                              className={`font-semibold text-white ${
                                isCollapsed ? 'text-sm' : 'text-sm'
                              }`}
                            >
                              {getInitials(user?.name || userName || 'U')}
                            </span>
                          )}
                          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                            <PencilLine size={isCollapsed ? 12 : 14} className="text-white shrink-0" strokeWidth={2} />
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
                            className={`absolute z-[120] min-w-[180px] rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden py-1 ${
                              isCollapsed
                                ? 'left-1/2 -translate-x-1/2 top-[calc(100%+8px)]'
                                : 'left-0 bottom-full mb-2'
                            }`}
                          >
                            {profilePhotoHref && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileAvatarMenu(false);
                                  setProfilePhotoViewer(true);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                              >
                                <ImageIcon size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                                Mostrar foto
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setProfileAvatarMenu(false);
                                profileAvatarInputRef.current?.click();
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Camera size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              Carregar foto
                            </button>
                            {profilePhotoHref && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileAvatarMenu(false);
                                  removeProfilePhotoMutation.mutate();
                                }}
                                disabled={removeProfilePhotoMutation.isPending}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                              >
                                <Trash2 size={15} className="shrink-0" />
                                Remover foto
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {isAdministrator ? 'Administrador' : user?.name || userName || 'Usuário'}
                      </p>
                      {!isAdministrator && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {(user as { employee?: { position?: string } } | undefined)?.employee
                            ?.position || userPosition}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title={showUserMenu ? 'Fechar menu (descer)' : 'Abrir menu (subir)'}
                      aria-expanded={showUserMenu}
                      aria-label={showUserMenu ? 'Fechar menu do usuário' : 'Abrir menu do usuário'}
                    >
                      {showUserMenu ? (
                        <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      ) : (
                        <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Menu de botões que desliza de baixo para cima com animação */}
            <div 
              className={`bg-white dark:bg-gray-900 transition-all duration-300 ease-in-out overflow-hidden ${
                showUserMenu 
                  ? 'max-h-[300px] opacity-100 translate-y-0' 
                  : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
              }`}
            >
                {/* Linha separadora superior */}
                <div className="mx-4">
                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                </div>
                
                {isCollapsed ? (
                  /* Quando colapsada: apenas ícones */
                  <div className="p-2 flex flex-col items-center space-y-2">
                    <button
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="w-10 h-10 flex items-center justify-center group transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title={isDark ? 'Modo Claro' : 'Modo Escuro'}
                    >
                      {isDark ? (
                        <Sun className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-yellow-600 dark:group-hover:text-yellow-500" />
                      ) : (
                        <Moon className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('openChangePasswordModal'));
                        setShowUserMenu(false);
                      }}
                      className="w-10 h-10 flex items-center justify-center group transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Alterar Senha"
                    >
                      <Lock className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-blue-700 dark:group-hover:text-blue-500" />
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-10 h-10 flex items-center justify-center group transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Sair"
                    >
                      <LogOut className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-red-700 dark:group-hover:text-red-500" />
                    </button>
                  </div>
                ) : (
                  /* Quando expandida: ícones com texto */
                  <div className="p-2">
                    <button
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 group transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {isDark ? (
                        <Sun className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-yellow-600 dark:group-hover:text-yellow-500" />
                      ) : (
                        <Moon className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300" />
                      )}
                      <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                        {isDark ? 'Modo Claro' : 'Modo Escuro'}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('openChangePasswordModal'));
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 group transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Lock className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-blue-700 dark:group-hover:text-blue-500" />
                      <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Alterar Senha</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 group transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <LogOut className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-red-700 dark:group-hover:text-red-500" />
                      <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Sair</span>
                    </button>
                  </div>
                )}
              </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
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

      {typeof document !== 'undefined' &&
        profilePhotoViewer &&
        profilePhotoHref &&
        createPortal(
          <div
            className="fixed inset-0 z-[10060] flex cursor-zoom-out flex-col bg-black/90 p-6"
            onClick={() => setProfilePhotoViewer(false)}
            role="presentation"
          >
            <button
              type="button"
              className="absolute top-4 right-4 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
              onClick={() => setProfilePhotoViewer(false)}
              aria-label="Fechar"
            >
              <X className="h-7 w-7" strokeWidth={2} />
            </button>
            <div className="flex flex-1 items-center justify-center min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profilePhotoHref}
                alt=""
                className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
