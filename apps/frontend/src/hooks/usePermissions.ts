import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
  PERMISSION_MODULE_KEYS_OPEN_ACCESS,
} from '@sistema-ponto/permission-modules';
import api from '@/lib/api';
import {
  AUTH_TOKEN_REFRESHED_EVENT,
  forceAuthRedirect,
  hasStoredAuthToken,
} from '@/lib/authSession';
import { resolveWorkflowApproverNameKey } from '@/lib/fluigWorkflowApproval';
import { isSociosDepartment, isSociosBlockedCollaborationPath } from '@/lib/sociosCollaborationAccess';
import { authService } from '@/lib/auth';

type PermissionItem = { module: string; action: string };

const pk = pathToModuleKey;
const FLUIG_APROVADORES_CONTROLE_KEY = pk('/ponto/controle/gerenciar-aprovadores-fluig');

function resolveEmployeeDepartment(user: { employee?: { department?: string | null } | null } | null | undefined): string | undefined {
  const fromApi = user?.employee?.department;
  if (typeof fromApi === 'string' && fromApi.trim()) return fromApi.trim();
  try {
    const stored = authService.getUser()?.employee?.department;
    if (typeof stored === 'string' && stored.trim()) return stored.trim();
  } catch {
    // ignore
  }
  return undefined;
}

export function usePermissions() {
  const queryClient = useQueryClient();

  const {
    data: userData,
    isLoading: isLoadingUser,
    isError: isUserError,
    error: userError,
  } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me', {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      const body = res.data;
      // Mantém localStorage alinhado ao /auth/me (setor atualizado sem precisar relogar)
      if (body?.data && typeof window !== 'undefined') {
        try {
          const remember = Boolean(localStorage.getItem('token'));
          authService.setUser(body.data, remember);
        } catch {
          // ignore quota / private mode
        }
      }
      return body;
    },
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: () => hasStoredAuthToken(),
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429 || status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    const refreshUser = () => {
      void queryClient.invalidateQueries({ queryKey: ['user'] });
      void queryClient.invalidateQueries({ queryKey: ['me-permissions'] });
    };

    window.addEventListener(AUTH_TOKEN_REFRESHED_EVENT, refreshUser);
    return () => window.removeEventListener(AUTH_TOKEN_REFRESHED_EVENT, refreshUser);
  }, [queryClient]);

  useEffect(() => {
    if (typeof window === 'undefined' || isLoadingUser) return;
    if (userData?.data) return;
    if (window.location.pathname.startsWith('/auth/')) return;

    const status = (userError as { response?: { status?: number } } | undefined)?.response?.status;

    if (!hasStoredAuthToken()) {
      forceAuthRedirect();
      return;
    }

    if (isUserError && (status === 401 || status === 403)) {
      forceAuthRedirect();
    }
  }, [isLoadingUser, isUserError, userData, userError]);

  const user = userData?.data;
  const userPosition = user?.employee?.position;
  const userDepartment = resolveEmployeeDepartment(user);
  const isAdministrator = userPosition === 'Administrador';

  const { data: permissionData, isPending: permissionsPending } = useQuery({
    // Isola cache por usuário — evita flash de permissões do login anterior
    queryKey: ['me-permissions', user?.id ?? 'anonymous'],
    queryFn: async () => {
      const res = await api.get('/permissions/me');
      return res.data?.data;
    },
    enabled: !!user?.id,
  });

  const isLoading = isLoadingUser || (!!user?.id && permissionsPending);

  const allowedSet = new Set<string>(
    ((permissionData?.permissions || []) as PermissionItem[])
      .filter((p) => p.action === PERMISSION_ACCESS_ACTION)
      .map((p) => p.module)
  );
  const allowedActionSet = new Set<string>(
    ((permissionData?.permissions || []) as PermissionItem[]).map((p) => `${p.module}:${p.action}`)
  );

  const allowedContractIds: string[] = permissionData?.allowedContractIds ?? [];
  const allowedContractIdSet = new Set(allowedContractIds);
  const dpApprovalContractIds: string[] = permissionData?.dpApprovalContractIds ?? [];
  const dpApprovalContractIdSet = new Set(dpApprovalContractIds);
  const gestorCostCenterIds: string[] = permissionData?.gestorCostCenterIds ?? [];
  const isUnbUser = !!permissionData?.isUnbUser;
  const unbCostCenterIds: string[] = permissionData?.unbCostCenterIds ?? [];

  type ContractModuleFlagRow = {
    orcamento: boolean;
    relatorios: boolean;
    ordemServico: boolean;
    producaoSemanal: boolean;
  };
  const contractModuleFlags: Record<string, ContractModuleFlagRow> =
    (permissionData?.contractModuleFlags as Record<string, ContractModuleFlagRow> | undefined) ?? {};

  const fluigApproverFullAccess =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    !!permissionData?.fluigApproverFullAccess;
  const fluigApproverNameKeys: string[] = permissionData?.fluigApproverNameKeys ?? [];
  const fluigApproverNameKeySet = new Set(fluigApproverNameKeys);
  const canManageFluigApproverViewers =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    !!permissionData?.canManageFluigApproverViewers;
  const canAccessFluigApproversRoute =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    allowedSet.has(FLUIG_APROVADORES_CONTROLE_KEY) ||
    fluigApproverNameKeys.length > 0;

  const canAccessFluigApprover = (nameKey: string) => {
    if (permissionsPending) return false;
    if (fluigApproverFullAccess) return true;
    return fluigApproverNameKeySet.has(resolveWorkflowApproverNameKey(nameKey));
  };

  const filterFluigApprovers = <T extends { nameKey: string }>(items: readonly T[]): T[] => {
    if (permissionsPending) return [];
    if (fluigApproverFullAccess) return [...items];
    return items.filter((item) => fluigApproverNameKeySet.has(item.nameKey));
  };

  const hasOrcamentoViaAnyAllowedContract =
    Object.values(contractModuleFlags).some((f) => f?.orcamento === true);
  const hasOrdemServicoViaAnyAllowedContract = Object.values(contractModuleFlags).some(
    (f) => f?.ordemServico === true
  );

  const can = (moduleKey: string) => {
    if (isAdministrator || permissionData?.isAdmin) {
      return true;
    }
    return allowedSet.has(moduleKey);
  };
  const canAction = (moduleKey: string, action: string) => {
    if (isAdministrator || permissionData?.isAdmin) return true;
    return allowedActionSet.has(`${moduleKey}:${action}`);
  };

  /** Acesso a um contrato específico (requer módulo Contratos + autorização explícita). */
  const canAccessContract = (contractId: string) => {
    if (isAdministrator || permissionData?.isAdmin) return true;
    if (!can(pk('/ponto/contratos'))) return false;
    return allowedContractIdSet.has(contractId);
  };

  const isDepartmentPessoal = userDepartment?.toLowerCase().includes('departamento pessoal') || 
                               userDepartment?.toLowerCase().includes('pessoal');

  const isDepartmentProjetos = userDepartment?.toLowerCase().includes('projetos');

  const isDepartmentFinanceiro = userDepartment?.toLowerCase().includes('financeiro');

  const isDepartmentCompras = userDepartment?.toLowerCase().includes('compras');

  const isDepartmentJuridico =
    userDepartment?.toLowerCase().includes('jurídico') ||
    userDepartment?.toLowerCase().includes('juridico');

  const isDepartmentSocios = isSociosDepartment(userDepartment);
  /**
   * Chat, agenda, flow, drive e tasks (kanban) — ocultos/bloqueados só para quem tem
   * setor «Sócios» no cadastro do funcionário. Enquanto o usuário carrega, não libera
   * (evita flash dos atalhos para Sócios).
   */
  const canAccessCollaborationTools =
    !isLoadingUser && !!user && !isDepartmentSocios;

  const employeesKey = pk('/ponto/funcionarios');
  const contractsKey = pk('/ponto/contratos');
  /** Ações granulares persistidas além do `acesso` do módulo (matriz Ver/Criar/Editar/Excluir). */
  const EMPLOYEE_MODULE_CRUD = ['ver', 'criar', 'editar', 'excluir'] as const;
  const isElevatedUser = isAdministrator || !!permissionData?.isAdmin;
  const hasEmployeeAcesso = can(employeesKey);
  /**
   * Com matriz granular, o salvamento ainda grava `acesso` no módulo (payload base).
   * Nesse caso o `acesso` não pode liberar criar/excluir — só as linhas `ponto_funcionarios:criar` etc.
   * Cadastro antigo: só `acesso`, sem linhas CRUD → mantém comportamento de “módulo inteiro”.
   */
  const hasEmployeeGranular =
    !isElevatedUser &&
    EMPLOYEE_MODULE_CRUD.some((a) => allowedActionSet.has(`${employeesKey}:${a}`));
  /** Qualquer permissão no módulo (rota / botões da lista). */
  const canAccessEmployeesModule =
    hasEmployeeAcesso ||
    canAction(employeesKey, 'ver') ||
    canAction(employeesKey, 'criar') ||
    canAction(employeesKey, 'editar') ||
    canAction(employeesKey, 'excluir');

  const canViewEmployees = hasEmployeeGranular
    ? EMPLOYEE_MODULE_CRUD.some((a) => canAction(employeesKey, a))
    : hasEmployeeAcesso;
  const canCreateEmployees = hasEmployeeGranular
    ? canAction(employeesKey, 'criar')
    : hasEmployeeAcesso;
  const canEditEmployees = hasEmployeeGranular
    ? canAction(employeesKey, 'editar')
    : hasEmployeeAcesso;
  const canDeleteEmployees = hasEmployeeGranular
    ? canAction(employeesKey, 'excluir')
    : hasEmployeeAcesso;

  const hasContractAcesso = can(contractsKey);
  /**
   * Com matriz granular (Ver/Criar/Editar/Excluir), `acesso` sozinho não libera mutações.
   * Só `ver` → pode ver, não criar/editar/excluir (mesmo padrão de Funcionários).
   * Cadastro legado: só `acesso`, sem linhas CRUD → mantém módulo inteiro.
   */
  const CONTRACT_MODULE_CRUD = ['ver', 'criar', 'editar', 'excluir'] as const;
  const hasContractGranular =
    !isElevatedUser &&
    CONTRACT_MODULE_CRUD.some((a) => allowedActionSet.has(`${contractsKey}:${a}`));
  const canCreateContracts = hasContractGranular
    ? canAction(contractsKey, 'criar')
    : hasContractAcesso;
  const canEditContracts = hasContractGranular
    ? canAction(contractsKey, 'editar')
    : hasContractAcesso;
  const canDeleteContracts = hasContractGranular
    ? canAction(contractsKey, 'excluir')
    : hasContractAcesso;

  /** Rescisão / alteração função-salário: admin, equipe DP (gerenciar), Controle «criar solicitações restritas» ou Gestor DP no contrato. */
  const canCreateSensitiveDpRequestType = (contractId: string | null | undefined) => {
    if (isAdministrator || permissionData?.isAdmin) return true;
    if (can(pk('/ponto/gerenciar-solicitacoes-dp'))) return true;
    if (can(pk('/ponto/controle/criar-tipos-restritos-dp'))) return true;
    if (!contractId) return false;
    return dpApprovalContractIdSet.has(contractId);
  };

  /** Tela / API de aprovações DP: gestor por contrato ou permissão legada (Controle). */
  const canAccessDpApproverPages =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    dpApprovalContractIds.length > 0 ||
    can(pk('/ponto/controle/aprovar-solicitacoes-dp'));

  /** Bloco «Espelhos da Nota Fiscal» na tela de Aprovações: aprovação pelo Controle. */
  const canApproveEspelhoNf =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/aprovar-espelho-nf'));

  const canApproveOcCompras =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/aprovar-oc-compras'));
  const canApproveOcDiretoria =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/aprovar-oc-diretoria'));
  const hasLegacyRmApproveControle =
    !isAdministrator &&
    !permissionData?.isAdmin &&
    can(pk('/ponto/controle/aprovar-requisicoes-materiais'));
  /** Aprovação OC fase gestor: somente gestor do contrato (coluna Gestor) ou admin. */
  const canApproveOcGestor =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    dpApprovalContractIds.length > 0;
  const canApproveOc = canApproveOcCompras || canApproveOcDiretoria || canApproveOcGestor;

  /** Ações por aba do fluxo de OC (Controle). Admin libera todas. */
  const canActOcAttachBoleto =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/oc-anexar-boleto'));
  const canActOcPayment =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/oc-pagamento'));
  const canActOcValidateProof =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/oc-validar-comprovante'));
  const canActOcProofCorrection =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/oc-corrigir-comprovante'));
  const canActOcAttachNf =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/oc-anexar-nf'));
  const canActOcCorrection =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/oc-correcao'));
  /** Controle: devolver item da OC à RM. */
  const canReturnOcItemToRmPermission =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/oc-devolver-item-rm'));

  /** Controle — Gestão de OS (manutenção predial). */
  const canGestaoOsAnalisar =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/gestao-os-analisar'));
  const canGestaoOsExecutar =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/gestao-os-executar'));
  const canGestaoOsEncerrar =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/gestao-os-encerrar'));
  const canGestaoOsCadastros =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/sistema-gestao-os/cadastros')) ||
    can(pk('/ponto/sistema-gestao-os/locais')) ||
    can(pk('/ponto/sistema-gestao-os/equipamentos')) ||
    can(pk('/ponto/sistema-gestao-os/tipos-servico'));

  /** Aprovação de RMs: gestor por contrato ou permissão legada Controle. */
  const canApproveMaterialRequests =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    dpApprovalContractIds.length > 0 ||
    can(pk('/ponto/controle/aprovar-requisicoes-materiais'));

  /**
   * Escopo de centros de custo do gestor de contrato.
   * undefined = sem filtro (admin ou permissão legada Controle).
   * string[] = centros de custo dos contratos em que é gestor.
   */
  const rmGestorScopedCostCenterIds: string[] | undefined =
    isAdministrator || !!permissionData?.isAdmin
      ? undefined
      : hasLegacyRmApproveControle
        ? undefined
        : dpApprovalContractIds.length > 0
          ? gestorCostCenterIds
          : undefined;

  const ocGestorScopedCostCenterIds: string[] | undefined =
    isAdministrator || !!permissionData?.isAdmin
      ? undefined
      : dpApprovalContractIds.length > 0
        ? gestorCostCenterIds
        : undefined;

  /** Alias legado — mesmo escopo da RM (aprovação por contrato). */
  const gestorScopedCostCenterIds = rmGestorScopedCostCenterIds;

  /** Bloco «Solicitações de Combustível» na tela de Aprovações (somente permissão Controle). */
  const canApproveFuel =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/aprovar-combustivel'));

  /** Custos/valores nos cards do Kanban (permissão Controle ou admin). */
  const canViewKanbanValues =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/ver-valores-kanban'));


  /** Lista de orçamentos: módulo Contratos + permissão checklist «Orçamento» em pelo menos um contrato. */
  const canAccessOrcamentoRoutePage =
    isElevatedUser ||
    (can(pk('/ponto/contratos')) && hasOrcamentoViaAnyAllowedContract);

  /**
   * Tela global «Ordem de Serviço»:
   * exige Ver/acesso do módulo na aba Acesso + checklist O.S. em pelo menos um contrato liberado.
   * (Antes ignorava a matriz Acesso e liberava só com Contratos + flag O.S.)
   */
  const canAccessOsRoutePage =
    isElevatedUser ||
    (can(pk('/ponto/andamento-da-os')) &&
      can(pk('/ponto/contratos')) &&
      hasOrdemServicoViaAnyAllowedContract);

  /**
   * Recebimento de entregas:
   * exige Ver/acesso do módulo na aba Acesso + ao menos um contrato liberado.
   */
  const canAccessRecebimentoEntregasRoutePage =
    isElevatedUser ||
    (can(pk('/ponto/recebimento-entregas')) &&
      can(pk('/ponto/contratos')) &&
      allowedContractIds.length > 0);

  const canAccessContractOrdemServicoTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.ordemServico === true
    );
  };

  const canAccessContractProducaoSemanalTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.producaoSemanal === true
    );
  };

  const canAccessContractOrcamentoTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.orcamento === true
    );
  };

  const canAccessContractRelatoriosTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.relatorios === true
    );
  };

  const finalPermissions = {
    canAccessPayroll: can(pk('/ponto/folha-pagamento')) || can(pk('/relatorios/alocacao')),
    /** Acesso ao módulo Funcionários (inclui granularidade definida na tela de permissões). */
    canManageEmployees: canAccessEmployeesModule,
    canViewEmployees,
    canCreateEmployees,
    canEditEmployees,
    canDeleteEmployees,
    canViewReports: can(pk('/ponto/dashboard')),
    canManageVacations:
      can(pk('/ponto/gerenciar-ferias')) ||
      can(pk('/ponto/ferias')) ||
      can(pk('/ponto/gerenciar-feriados')),
    canManageAbsences:
      can(pk('/ponto/atestados')) || can(pk('/ponto/gerenciar-atestados')),
    canManageBankHours: can(pk('/ponto/banco-horas')),
    canViewBirthdays: true,
    canRegisterTime: true,
    canViewDashboard: can(pk('/ponto/dashboard')),
    canCreateContracts,
    canEditContracts,
    canDeleteContracts,
  };

  return {
    user,
    isAuthenticated: !!user,
    userPosition,
    userDepartment,
    isAdministrator,
    isElevatedUser,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    isDepartmentCompras,
    isDepartmentJuridico,
    isDepartmentSocios,
    canAccessCollaborationTools,
    permissions: finalPermissions,
    can,
    canAction,
    allowedContractIds,
    dpApprovalContractIds,
    gestorCostCenterIds,
    isUnbUser,
    unbCostCenterIds,
    gestorScopedCostCenterIds,
    ocGestorScopedCostCenterIds,
    canCreateSensitiveDpRequestType,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveOc,
    canApproveOcCompras,
    canApproveOcDiretoria,
    canApproveOcGestor,
    canActOcAttachBoleto,
    canActOcPayment,
    canActOcValidateProof,
    canActOcProofCorrection,
    canActOcAttachNf,
    canActOcCorrection,
    canReturnOcItemToRmPermission,
    canGestaoOsAnalisar,
    canGestaoOsExecutar,
    canGestaoOsEncerrar,
    canGestaoOsCadastros,
    canApproveMaterialRequests,
    canApproveFuel,
    canViewKanbanValues,
    canAccessContract,
    contractModuleFlags,
    canAccessOrcamentoRoutePage,
    canAccessOsRoutePage,
    canAccessRecebimentoEntregasRoutePage,
    canAccessContractOrcamentoTab,
    canAccessContractRelatoriosTab,
    canAccessContractOrdemServicoTab,
    canAccessContractProducaoSemanalTab,
    fluigApproverFullAccess,
    fluigApproverNameKeys,
    canManageFluigApproverViewers,
    canAccessFluigApproversRoute,
    canAccessFluigApprover,
    filterFluigApprovers,
    isLoading,
    canAccessPayroll: finalPermissions.canAccessPayroll,
    canManageEmployees: finalPermissions.canManageEmployees,
    canViewReports: finalPermissions.canViewReports,
    canManageVacations: finalPermissions.canManageVacations,
    canManageAbsences: finalPermissions.canManageAbsences,
    canManageBankHours: finalPermissions.canManageBankHours,
    canViewBirthdays: finalPermissions.canViewBirthdays,
    canRegisterTime: finalPermissions.canRegisterTime,
    canViewDashboard: finalPermissions.canViewDashboard,
    canCreateContracts: finalPermissions.canCreateContracts,
    canEditContracts: finalPermissions.canEditContracts,
    canDeleteContracts: finalPermissions.canDeleteContracts,
    canViewEmployees: finalPermissions.canViewEmployees,
    canCreateEmployees: finalPermissions.canCreateEmployees,
    canEditEmployees: finalPermissions.canEditEmployees,
    canDeleteEmployees: finalPermissions.canDeleteEmployees,
  };
}

export function useRoutePermission(route: string) {
  const {
    permissions,
    isLoading,
    isElevatedUser,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    isDepartmentCompras,
    isDepartmentJuridico,
    canAccessCollaborationTools,
    can,
    canAccessContract,
    dpApprovalContractIds,
    canApproveEspelhoNf,
    canAccessOrcamentoRoutePage,
    canAccessOsRoutePage,
    canAccessRecebimentoEntregasRoutePage,
    fluigApproverNameKeys,
    canAccessFluigApproversRoute,
  } = usePermissions();

  const OPEN_ACCESS = new Set(PERMISSION_MODULE_KEYS_OPEN_ACCESS);

  if (isLoading) {
    return { hasAccess: false, isLoading: true, canAccessContract };
  }

  // Setor Sócios: sem chat, agenda, flow, drive nem tasks
  if (!canAccessCollaborationTools && isSociosBlockedCollaborationPath(route)) {
    return { hasAccess: false, isLoading: false, canAccessContract };
  }

  // Drive / Kanban / Flow: liberados para qualquer usuário autenticado (exceto Sócios acima)
  if (OPEN_ACCESS.has(pk(route))) {
    return { hasAccess: true, isLoading: false, canAccessContract };
  }

  const isAdministrator = isElevatedUser;

  const routePermissions: Record<string, boolean> = {
    '/ponto': isAdministrator || isDepartmentPessoal || permissions.canRegisterTime,
    '/ponto/painel-do-sistema': isAdministrator || isDepartmentPessoal || permissions.canViewDashboard,
    '/ponto/agenda': canAccessCollaborationTools,
    '/ponto/conversas': canAccessCollaborationTools,
    /**
     * Aprovações: a página agora aparece automaticamente para quem precisa decidir
     * sobre algum bloco. Não há mais entrada na matriz de acessos.
     *  - Gestor de algum contrato (decide Solicitações Gerais) → vê o bloco de Solicitações.
     *  - Permissão «Aprovar Espelho da Nota Fiscal» (Controle) → vê o bloco de Espelhos da Nota Fiscal.
     *  - Compras / Gerenciar materiais → vê o bloco de aprovação de OC.
     * Cada bloco é renderizado independentemente dentro da própria página.
     */
    '/ponto/aprovacoes':
      isAdministrator ||
      dpApprovalContractIds.length > 0 ||
      can(pk('/ponto/controle/aprovar-solicitacoes-dp')) ||
      canApproveEspelhoNf ||
      can(pk('/ponto/controle/aprovar-combustivel')) ||
      can(pk('/ponto/controle/aprovar-oc-compras')) ||
      can(pk('/ponto/controle/aprovar-oc-diretoria')) ||
      can(pk('/ponto/controle/aprovar-requisicoes-materiais')),
    '/ponto/funcionarios':
      isAdministrator || isDepartmentPessoal || permissions.canManageEmployees,
    '/ponto/aniversariantes': isAdministrator || isDepartmentPessoal || can(pk('/ponto/aniversariantes')),
    '/ponto/seguranca-do-trabalho':
      isAdministrator || isDepartmentPessoal || can(pk('/ponto/seguranca-do-trabalho')),
    '/ponto/atestados': isAdministrator || can(pk('/ponto/atestados')),
    '/ponto/gerenciar-atestados': isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-atestados')),
    '/ponto/solicitacoes': isAdministrator || can(pk('/ponto/solicitacoes')),
    '/ponto/gerenciar-solicitacoes': isAdministrator || can(pk('/ponto/gerenciar-solicitacoes')),
    '/ponto/solicitacoes-gerais':
      isAdministrator || isDepartmentPessoal || can(pk('/ponto/solicitacoes-dp')),
    '/ponto/gerenciar-solicitacoes-gerais':
      isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-solicitacoes-dp')),
    '/ponto/gerenciar-solicitacoes-adm-tst':
      isAdministrator || can(pk('/ponto/gerenciar-solicitacoes-adm-tst')),
    '/ponto/ferias': isAdministrator || can(pk('/ponto/ferias')),
    '/ponto/gerenciar-ferias': isAdministrator || isDepartmentPessoal || permissions.canManageVacations,
    '/ponto/gerenciar-feriados': isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-feriados')),
    '/ponto/banco-horas': isAdministrator || isDepartmentPessoal || permissions.canManageBankHours,
    '/ponto/folha-pagamento': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/relatorios/alocacao': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/ponto/centros-custo': isAdministrator || isDepartmentPessoal || can(pk('/ponto/centros-custo')),
    '/ponto/materiais-construcao': isAdministrator || isDepartmentPessoal || can(pk('/ponto/materiais-construcao')),
    '/ponto/andamento-da-os': canAccessOsRoutePage,
    '/ponto/meus-chamados': true,
    '/ponto/sistema-gestao-os': isAdministrator || can(pk('/ponto/sistema-gestao-os')),
    '/ponto/sistema-gestao-os/planos':
      isAdministrator ||
      can(pk('/ponto/sistema-gestao-os/planos')) ||
      can(pk('/ponto/sistema-gestao-os')),
    '/ponto/sistema-gestao-os/relatorios':
      isAdministrator ||
      can(pk('/ponto/sistema-gestao-os/relatorios')) ||
      can(pk('/ponto/sistema-gestao-os')),
    '/ponto/sistema-gestao-os/cadastros':
      isAdministrator ||
      can(pk('/ponto/sistema-gestao-os/cadastros')) ||
      can(pk('/ponto/sistema-gestao-os')),
    '/ponto/sistema-gestao-os/locais':
      isAdministrator ||
      can(pk('/ponto/sistema-gestao-os/locais')) ||
      can(pk('/ponto/sistema-gestao-os/cadastros')) ||
      can(pk('/ponto/sistema-gestao-os')),
    '/ponto/sistema-gestao-os/equipamentos':
      isAdministrator ||
      can(pk('/ponto/sistema-gestao-os/equipamentos')) ||
      can(pk('/ponto/sistema-gestao-os/cadastros')) ||
      can(pk('/ponto/sistema-gestao-os')),
    '/ponto/sistema-gestao-os/tipos-servico':
      isAdministrator ||
      can(pk('/ponto/sistema-gestao-os/tipos-servico')) ||
      can(pk('/ponto/sistema-gestao-os/cadastros')) ||
      can(pk('/ponto/sistema-gestao-os')),
    '/ponto/permissoes': true,
    '/ponto/conversas-whatsapp': isAdministrator || isDepartmentPessoal || can(pk('/ponto/conversas-whatsapp')),
    '/ponto/financeiro': isAdministrator || can(pk('/ponto/financeiro')),
    '/ponto/financeiro/analise-extrato':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise-extrato')),
    '/ponto/financeiro/gestao-solicitacoes':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/gestao-solicitacoes')),
    '/ponto/fluig/aprovacoes-workflow':
      isAdministrator ||
      isDepartmentFinanceiro ||
      isDepartmentCompras ||
      can(pk('/ponto/fluig/aprovacoes-workflow')),
    '/ponto/fluig/aprovadores': canAccessFluigApproversRoute,
    '/ponto/orcamento': canAccessOrcamentoRoutePage,
    '/ponto/contratos': isAdministrator || can(pk('/ponto/contratos')),
    '/ponto/contratos/controle-geral': isAdministrator || can(pk('/ponto/contratos/controle-geral')),
    '/ponto/contratos/socios': isAdministrator || can(pk('/ponto/contratos/socios')),
    '/ponto/contratos/gastos-operacionais':
      isAdministrator || can(pk('/ponto/contratos/gastos-operacionais')),
    '/ponto/pleitos-gerados': isAdministrator || can(pk('/ponto/pleitos-gerados')),
    '/ponto/aprovacao-fds': isAdministrator || can(pk('/ponto/aprovacao-fds')),
    '/ponto/recebimento-entregas': canAccessRecebimentoEntregasRoutePage,
    '/ponto/espelho-nf': isAdministrator || can(pk('/ponto/espelho-nf')),
    '/ponto/prestadores-servico':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/prestadores-servico')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/tomadores-servico':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/tomadores-servico')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/contas-bancarias':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/contas-bancarias')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/codigos-tributarios':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/codigos-tributarios')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/licitacoes': isAdministrator || can(pk('/ponto/licitacoes')),
    '/ponto/responsaveis-tecnicos': isAdministrator || can(pk('/ponto/responsaveis-tecnicos')),
    '/ponto/controle-anuidade': isAdministrator || can(pk('/ponto/controle-anuidade')),
    '/ponto/controle-pagamentos-art': isAdministrator || can(pk('/ponto/controle-pagamentos-art')),
    '/ponto/contratos/medicao': isAdministrator || can(pk('/ponto/contratos/medicao')),
    '/ponto/solicitar-materiais': isAdministrator || can(pk('/ponto/solicitar-materiais')),
    '/ponto/solicitar-ferramentas':
      isAdministrator || can(pk('/ponto/solicitar-ferramentas')),
    '/ponto/gerenciar-materiais': isAdministrator || isDepartmentCompras || can(pk('/ponto/gerenciar-materiais')),
    '/ponto/mapa-cotacao': isAdministrator || isDepartmentCompras || can(pk('/ponto/mapa-cotacao')),
    '/ponto/ordem-de-compra': isAdministrator || isDepartmentCompras || can(pk('/ponto/ordem-de-compra')),
    '/ponto/controle-entregas': isAdministrator || can(pk('/ponto/controle-entregas')),
    '/ponto/entregas-logistica':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/entregas-logistica')),
    '/ponto/entrega-logistica':
      isAdministrator || can(pk('/ponto/entrega-logistica')),
    '/ponto/estoque': isAdministrator || isDepartmentCompras || can(pk('/ponto/estoque')),
    '/ponto/ajuste-estoque': isAdministrator || isDepartmentCompras || can(pk('/ponto/ajuste-estoque')),
    '/ponto/furo-estoque': isAdministrator || isDepartmentCompras || can(pk('/ponto/furo-estoque')),
    '/ponto/fds-aprovadas':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/fds-aprovadas')),
    '/ponto/solicitacoes-combustivel':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-combustivel')),
    '/ponto/solicitacoes-reserva-veiculos':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-reserva-veiculos')),
    '/ponto/solicitacoes-ferramentas':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-ferramentas')),
    '/ponto/fornecedores': isAdministrator || isDepartmentCompras || can(pk('/ponto/fornecedores')),
    '/ponto/veiculos': isAdministrator || isDepartmentCompras || can(pk('/ponto/veiculos')),
    '/ponto/regioes-postos-combustivel':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/regioes-postos-combustivel')),
    '/ponto/reserva-veiculos':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/reserva-veiculos')),
    '/ponto/solicitar-combustivel':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitar-combustivel')),
    '/ponto/condicoes-pagamento':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/condicoes-pagamento')),
    '/ponto/natureza-orcamentaria':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/natureza-orcamentaria')),
    '/ponto/juridico':
      isAdministrator || isDepartmentJuridico || can(pk('/ponto/juridico')),
    '/ponto/financeiro/controle-financeiro':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/controle-financeiro')),
    '/ponto/financeiro/receitas':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/receitas')),
    '/ponto/financeiro/controle-nfs':
      isAdministrator ||
      isDepartmentFinanceiro ||
      can(pk('/ponto/financeiro/controle-nfs')) ||
      can(pk('/ponto/financeiro/analise-extrato')) ||
      can(pk('/ponto/financeiro/controle-financeiro')),
    '/ponto/financeiro/nfs-recebidas':
      isAdministrator ||
      isDepartmentFinanceiro ||
      can(pk('/ponto/financeiro/nfs-recebidas')) ||
      can(pk('/ponto/financeiro/controle-nfs')) ||
      can(pk('/ponto/financeiro/analise-extrato')) ||
      can(pk('/ponto/financeiro/controle-financeiro')),
  };

  return {
    hasAccess: routePermissions[route] ?? false,
    isLoading: false,
    canAccessContract,
  };
}
