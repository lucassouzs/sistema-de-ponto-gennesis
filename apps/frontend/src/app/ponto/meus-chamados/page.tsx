import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const MeusChamadosPageClient = dynamic(() => import('./MeusChamadosPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando Meus Chamados..." fullScreen size="lg" />
});

export default function MeusChamadosPage() {
  return <MeusChamadosPageClient />;
}
