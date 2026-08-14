import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const SistemaGestaoOsPageClient = dynamic(() => import('./SistemaGestaoOsPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando Central de Chamados..." fullScreen size="lg" />
});

export default function SistemaGestaoOsPage() {
  return <SistemaGestaoOsPageClient />;
}
