'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent } from '@/components/ui/Card';
import {
  UserPermissionsEditor,
  UserPermissionsTabBar,
  type PermissionEditorTab,
  type PermissionsTargetPreview,
} from '@/components/permissions/UserPermissionsEditor';
import api from '@/lib/api';
import toast from 'react-hot-toast';

type ContractLite = {
  id: string;
  name: string;
  number: string;
};

type ContractPermissionUser = {
  id: string;
  name: string;
  cpf?: string;
  email: string;
  employee?: { position?: string; department?: string };
  hasContractsModule: boolean;
  hasContractAccess: boolean;
};

type UserPermissionPayload = {
  user: { id: string; name: string; email: string; employee?: { position?: string | null } };
  isAdmin: boolean;
  permissions: Array<{ module: string; action: string }>;
  allowedContractIds: string[];
};

const CONTRACTS_MODULE_KEY = pathToModuleKey('/ponto/contratos');

function ContractAccessCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`inline-flex select-none items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'group cursor-pointer'}`}>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
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
      <span className={`min-w-[1.75rem] text-sm font-medium tabular-nums ${checked ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {checked ? 'Sim' : 'Não'}
      </span>
    </label>
  );
}

export default function ContractPermissionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const contractId = String(params?.id || '');
  const [listSearch, setListSearch] = useState('');
  const [permissionsTarget, setPermissionsTarget] = useState<PermissionsTargetPreview | null>(null);
  const [permissionTab, setPermissionTab] = useState<PermissionEditorTab>('gerais');
  const [showContractsTab, setShowContractsTab] = useState(false);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract-by-id', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data?.data as ContractLite,
    enabled: !!contractId,
    retry: false,
  });

  const { data: usersData = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['permission-contract-users', contractId],
    queryFn: async () =>
      (await api.get('/permissions/contract-users', { params: { contractId } })).data
        ?.data as ContractPermissionUser[],
    enabled: !!contractId,
    retry: false,
  });

  const toggleContractAccessMutation = useMutation({
    mutationFn: async ({ userId, allow }: { userId: string; allow: boolean }) => {
      const source = (await api.get(`/permissions/users/${userId}`)).data?.data as UserPermissionPayload;
      if (!source || source.isAdmin) {
        throw new Error('Usuário inválido para edição.');
      }

      const nextPermissions = Array.isArray(source.permissions) ? [...source.permissions] : [];
      const hasContractsAccess = nextPermissions.some(
        (p) => p.module === CONTRACTS_MODULE_KEY && p.action === PERMISSION_ACCESS_ACTION
      );
      if (!hasContractsAccess) {
        nextPermissions.push({ module: CONTRACTS_MODULE_KEY, action: PERMISSION_ACCESS_ACTION });
      }

      const currentIds = new Set(source.allowedContractIds || []);
      if (allow) currentIds.add(contractId);
      else currentIds.delete(contractId);

      await api.put(`/permissions/users/${userId}`, {
        permissions: nextPermissions,
        allowedContractIds: Array.from(currentIds),
      });
      return { userId, allow };
    },
    onSuccess: ({ userId, allow }) => {
      queryClient.setQueryData(['permission-contract-users', contractId], (prev: unknown) => {
        if (!Array.isArray(prev)) return prev;
        return (prev as ContractPermissionUser[]).map((u) =>
          u.id === userId ? { ...u, hasContractAccess: allow, hasContractsModule: true } : u
        );
      });
      toast.success(allow ? 'Contrato liberado para o usuário.' : 'Contrato removido para o usuário.');
    },
    onError: (error: unknown) => {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível atualizar acesso ao contrato.');
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const closeEditorWithSave = async () => {
    setPermissionsTarget(null);
    setPermissionTab('gerais');
    setShowContractsTab(false);
  };

  const usersWithContractsModule = useMemo(
    () => usersData.filter((u) => u.hasContractsModule),
    [usersData]
  );

  const filteredRows = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return usersWithContractsModule;
    return usersWithContractsModule.filter((u) => {
      const dept = u.employee?.department || '';
      const pos = u.employee?.position || '';
      const cpf = (u.cpf || '').replace(/\D/g, '');
      const qNumbers = q.replace(/\D/g, '');
      return (
        u.name.toLowerCase().includes(q) ||
        (!!qNumbers && cpf.includes(qNumbers)) ||
        dept.toLowerCase().includes(q) ||
        pos.toLowerCase().includes(q)
      );
    });
  }, [usersWithContractsModule, listSearch]);

  if (loadingUser || loadingContract || loadingUsers) {
    return <Loading message="Carregando permissões do contrato..." fullScreen size="lg" />;
  }

  const me = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const contract = contractData || ({ id: contractId, name: 'Contrato', number: '-' } as ContractLite);

  return (
    <MainLayout userRole={me.role} userName={me.name} onLogout={handleLogout}>
      <div className="space-y-4">
        {permissionsTarget ? (
          <>
            <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
              <button
                type="button"
                onClick={closeEditorWithSave}
                className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Salvar e voltar
              </button>
              <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                  Permissões do contrato
                </h1>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {contract.name} ({contract.number}) — ajuste as permissões do funcionário selecionado
                </p>
              </div>
            </div>

            <UserPermissionsTabBar
              activeTab={permissionTab}
              onChange={setPermissionTab}
              showContracts={showContractsTab}
              className="w-full pb-2"
            />

            <UserPermissionsEditor
              userId={permissionsTarget.id}
              preview={permissionsTarget}
              onBack={closeEditorWithSave}
              hideTopNavigation
              permissionTab={permissionTab}
              onPermissionTabChange={setPermissionTab}
              onContractsTabAvailabilityChange={setShowContractsTab}
            />
          </>
        ) : (
          <>
            <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
              <button
                type="button"
                onClick={() => router.push('/ponto/contratos')}
                className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Voltar
              </button>
              <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Permissões do contrato
                </h1>
                <p className="mt-1.5 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  Defina quais usuários podem acessar este contrato no sistema.
                </p>
              </div>
            </div>

            <Card
              className="w-full overflow-hidden border-gray-200/80 shadow-sm dark:border-gray-700/80"
              padding="none"
            >
              <CardContent className="!pt-0 p-0">
                <div className="border-b border-gray-200 bg-white px-4 py-5 dark:border-gray-700 dark:bg-gray-800 sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-sm font-bold text-blue-600 dark:border-blue-400 dark:bg-gray-800 dark:text-blue-400">
                        {(contract.name || 'CT')
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 self-center">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{contract.name}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          <span className="text-gray-700 dark:text-gray-300">
                            {contract.number || 'Sem numero de contrato'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="w-full sm:w-auto sm:min-w-[320px]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        <input
                          type="search"
                          value={listSearch}
                          onChange={(e) => setListSearch(e.target.value)}
                          placeholder="Buscar usuário..."
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white px-4 pb-6 dark:bg-gray-800 sm:px-6">
                  <div className="overflow-x-auto pt-4">
                    <table className="w-full min-w-[640px] table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                        <th
                          className="w-[50%] pb-3 pl-1 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                        >
                          Usuário
                        </th>
                        <th
                          className="w-[25%] px-1 pb-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                        >
                          Setor
                        </th>
                        <th
                          className="w-[25%] px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                        >
                          Liberado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-1 py-12 text-center text-gray-500 dark:text-gray-400">
                            Nenhum usuário encontrado com a busca.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((u) => (
                          <tr key={u.id} className="transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/25">
                            <td className="py-3.5 pl-1 pr-4 align-middle">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">{u.name}</p>
                            </td>
                            <td className="px-1 py-3.5 align-middle text-gray-700 dark:text-gray-300">
                              {u.employee?.department || 'Sem setor'}
                            </td>
                            <td className="px-1 py-3.5 text-center align-middle">
                              <div className="flex justify-center">
                                <ContractAccessCheckbox
                                  checked={u.hasContractAccess}
                                  disabled={toggleContractAccessMutation.isPending}
                                  onChange={(next) => {
                                    toggleContractAccessMutation.mutate({
                                      userId: u.id,
                                      allow: next,
                                    });
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="pt-1" />
          </>
        )}
      </div>
    </MainLayout>
  );
}
