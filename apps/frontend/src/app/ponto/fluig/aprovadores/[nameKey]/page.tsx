'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FluigWorkflowAprovadorDetailPage } from '@/components/fluig/FluigWorkflowAprovadorDetailPage';

export default function FluigAprovadorDetailRoutePage() {
  return (
    <ProtectedRoute route="/ponto/fluig/aprovadores">
      <FluigWorkflowAprovadorDetailPage />
    </ProtectedRoute>
  );
}
