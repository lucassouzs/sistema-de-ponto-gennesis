import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsPmocPageClient = dynamic(() => import('./GestaoOsPmocPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando PMOC..." fullScreen size="lg" />
});

export default function GestaoOsPmocPage() {
  return <GestaoOsPmocPageClient />;
}
