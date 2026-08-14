import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsLocaisPageClient = dynamic(() => import('./GestaoOsLocaisPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando locais e ativos..." fullScreen size="lg" />
});

export default function GestaoOsLocaisPage() {
  return <GestaoOsLocaisPageClient />;
}
