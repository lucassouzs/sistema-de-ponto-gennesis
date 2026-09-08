'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';

type GestaoOsMeResponse = {
  isAdmin: boolean;
  canAnalisar: boolean;
  canExecutar: boolean;
  canEncerrar: boolean;
  canCadastros: boolean;
};

/**
 * Single-tenant: sem seletor de empresa.
 * Capacidades vêm das permissões de Controle (+ admin).
 */
export function useGestaoOsCompany() {
  const {
    isAdministrator,
    canGestaoOsAnalisar,
    canGestaoOsExecutar,
    canGestaoOsEncerrar,
    canGestaoOsCadastros
  } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ['gestao-os-me'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsMeResponse }>('/gestao-os/me');
      return res.data?.data;
    }
  });

  const isAdmin = isAdministrator || !!data?.isAdmin;
  const canAnalisar = isAdmin || !!data?.canAnalisar || canGestaoOsAnalisar;
  const canExecutar = isAdmin || !!data?.canExecutar || canGestaoOsExecutar;
  const canEncerrar = isAdmin || !!data?.canEncerrar || canGestaoOsEncerrar;
  const canCadastros = isAdmin || !!data?.canCadastros || canGestaoOsCadastros;

  return {
    companyId: null as string | null,
    setCompanyId: (_id: string | null) => {},
    profile: null as null,
    memberships: [] as Array<{ companyId: string; profile: string; company: { id: string; name: string } }>,
    isAdmin,
    isManager: canAnalisar || canCadastros,
    canAnalisar,
    canExecutar,
    canEncerrar,
    canCadastros,
    isLoading,
    companyQuery: '',
    companyParams: {} as Record<string, string>
  };
}
