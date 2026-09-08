'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loading } from '@/components/ui/Loading';

/** Redireciona para a lista abrindo o modal da reunião. */
export default function ReuniaoDetalheRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const rawReuniaoId = params?.reuniaoId;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';
  const reuniaoId =
    typeof rawReuniaoId === 'string' ? rawReuniaoId : Array.isArray(rawReuniaoId) ? rawReuniaoId[0] ?? '' : '';

  useEffect(() => {
    if (!contractId) return;
    const qs = reuniaoId ? `?open=${encodeURIComponent(reuniaoId)}` : '';
    router.replace(`/ponto/contratos/${contractId}/reunioes${qs}`);
  }, [contractId, reuniaoId, router]);

  return <Loading message="Abrindo reunião…" fullScreen size="lg" />;
}
