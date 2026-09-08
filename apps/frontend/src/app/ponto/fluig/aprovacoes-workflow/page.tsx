'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FluigWorkflowAprovacoesPage } from '@/components/fluig/FluigWorkflowAprovacoesPage';

export default function FluigAprovacoesWorkflowRoutePage() {
  return (
    <ProtectedRoute route="/ponto/fluig/aprovacoes-workflow">
      <FluigWorkflowAprovacoesPage />
    </ProtectedRoute>
  );
}
