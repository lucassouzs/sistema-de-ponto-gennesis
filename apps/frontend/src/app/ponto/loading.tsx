import { PageSkeleton } from '@/components/ui/PageSkeleton';

/** Skeleton de rota em toda navegação dentro de /ponto. */
export default function PontoLoading() {
  return <PageSkeleton variant="page" label="Carregando página" />;
}
