import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loading } from '@/components/ui/Loading';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const FlowPageClient = dynamic(() => import('@/components/flow/FlowPageClient').then((m) => m.FlowPageClient), {
  ssr: false,
  loading: () => <Loading message="Carregando Flow..." fullScreen size="lg" />,
});

export default function FlowPage() {
  return (
    <ProtectedRoute route="/ponto/flow">
      <Suspense fallback={<Loading message="Carregando Flow..." fullScreen size="lg" />}>
        <FlowPageClient />
      </Suspense>
    </ProtectedRoute>
  );
}
