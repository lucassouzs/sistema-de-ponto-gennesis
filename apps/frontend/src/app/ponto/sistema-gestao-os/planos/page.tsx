import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsPlanosPageClient = dynamic(() => import('./GestaoOsPlanosPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando planos..." fullScreen size="lg" />
});

export default function GestaoOsPlanosPage() {
  return <GestaoOsPlanosPageClient />;
}
