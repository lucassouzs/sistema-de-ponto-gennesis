import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

type PermissionItem = { module: string; action: string };

type PermissionsMeData = {
  isAdmin?: boolean;
  permissions?: PermissionItem[];
};

/** Igual ao web (`@sistema-ponto/permission-modules`). */
function pathToModuleKey(href: string): string {
  const trimmed = href.replace(/\/$/, '') || '/';
  if (trimmed === '/' || trimmed === '') return 'root';
  return trimmed.replace(/^\//, '').replace(/\//g, '_');
}

const ACCESS_ACTION = 'acesso';
const PNCP_KEY = pathToModuleKey('/ponto/licitacoes-pncp');
const LICITACOES_KEY = pathToModuleKey('/ponto/licitacoes');
const COMBUSTIVEL_KEY = pathToModuleKey('/ponto/solicitar-combustivel');
const RESERVAS_KEY = pathToModuleKey('/ponto/reserva-veiculos');
const SOLICITACOES_DP_KEY = pathToModuleKey('/ponto/solicitacoes-dp');

function moduleReady(isFetched: boolean, isPending: boolean) {
  return isFetched && !isPending;
}

export function usePermissions() {
  const { user, isAuthenticated } = useAuth();

  const { data, isPending, isFetched } = useQuery({
    queryKey: ['me-permissions', user?.id ?? 'anonymous'],
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PermissionsMeData> => {
      const res = await api.get('/api/permissions/me');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Erro ao carregar permissões');
      }
      return (json?.data ?? json) as PermissionsMeData;
    },
  });

  const isAdministrator = user?.employee?.position === 'Administrador';
  const isElevated = isAdministrator || !!data?.isAdmin;
  const isDepartmentCompras =
    !!user?.employee?.department?.toLowerCase().includes('compras');
  const isDepartmentPessoal =
    !!user?.employee?.department?.toLowerCase().includes('pessoal');

  const allowedModules = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.permissions || []) {
      if (p.action === ACCESS_ACTION) set.add(p.module);
    }
    return set;
  }, [data?.permissions]);

  const ready = moduleReady(isFetched, isPending);

  const can = (moduleKey: string) => {
    if (isElevated) return true;
    return allowedModules.has(moduleKey);
  };

  const hasModule = (moduleKey: string) =>
    isElevated || (ready && allowedModules.has(moduleKey));

  // Mesma regra do sidebar web (Principal)
  const canSeeCombustivel =
    isElevated || isDepartmentCompras || hasModule(COMBUSTIVEL_KEY);

  const canSeeReservas =
    isElevated || isDepartmentCompras || hasModule(RESERVAS_KEY);

  const canSeePncp =
    isElevated ||
    (ready && (allowedModules.has(PNCP_KEY) || allowedModules.has(LICITACOES_KEY)));

  const canSeeDpRequests =
    isElevated || isDepartmentPessoal || hasModule(SOLICITACOES_DP_KEY);

  return {
    isLoading: isAuthenticated && !!user?.id && !isElevated && (isPending || !isFetched),
    isAdministrator: isElevated,
    can,
    canSeeCombustivel,
    canSeeReservas,
    canSeePncp,
    canSeeDpRequests,
  };
}
