'use client';

import React from 'react';
import { usePermissions, useRoutePermission } from '@/hooks/usePermissions';
import { Shield, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';

interface ProtectedRouteProps {
  children: React.ReactNode;
  route: string;
  /** Quando informado (ex.: página de um contrato), exige também autorização a esse contrato. */
  contractId?: string;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, route, contractId, fallback }: ProtectedRouteProps) {
  const { hasAccess, isLoading } = useRoutePermission(route);
  const { canAccessContract, isLoading: loadingUserPerms } = usePermissions();

  if (isLoading || loadingUserPerms) {
    return (
      <Loading 
        message="Verificando permissões..."
        fullScreen
        size="lg"
      />
    );
  }

  if (contractId && hasAccess && !canAccessContract(contractId)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="p-4 bg-red-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Acesso negado a este contrato
            </h2>
            <p className="text-gray-600 mb-4">
              Você não tem autorização para acessar este contrato. Peça ao administrador para liberar o contrato nas permissões.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="p-4 bg-red-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Acesso Negado
            </h2>
            <p className="text-gray-600 mb-4">
              Você não tem permissão para acessar esta página. Esta funcionalidade está disponível apenas para cargos específicos.
            </p>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  Entre em contato com o administrador se precisar de acesso a esta funcionalidade.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
