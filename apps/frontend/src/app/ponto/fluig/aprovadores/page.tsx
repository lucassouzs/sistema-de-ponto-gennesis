'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FluigWorkflowAprovadoresPage } from '@/components/fluig/FluigWorkflowAprovadoresPage';

export default function FluigAprovadoresRoutePage() {
  return (
    <ProtectedRoute route="/ponto/fluig/aprovadores">
      <FluigWorkflowAprovadoresPage />
    </ProtectedRoute>
  );
}
