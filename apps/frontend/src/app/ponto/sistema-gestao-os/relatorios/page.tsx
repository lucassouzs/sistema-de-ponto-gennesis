import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsRelatoriosPageClient = dynamic(() => import('./GestaoOsRelatoriosPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando relatórios..." fullScreen size="lg" />
});

export default function GestaoOsRelatoriosPage() {
  return <GestaoOsRelatoriosPageClient />;
}
