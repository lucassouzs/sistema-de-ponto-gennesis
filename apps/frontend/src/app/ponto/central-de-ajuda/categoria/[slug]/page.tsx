'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';

/** Categorias antigas redirecionam para o hub agrupado por setor. */
export default function HelpCategoryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/ponto/central-de-ajuda');
  }, [router]);

  return (
    <ProtectedRoute route="/ponto/central-de-ajuda">
      <Loading message="Redirecionando..." fullScreen size="lg" />
    </ProtectedRoute>
  );
}
