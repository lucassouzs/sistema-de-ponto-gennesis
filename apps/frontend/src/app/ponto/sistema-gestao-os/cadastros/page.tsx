import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsCadastrosPageClient = dynamic(() => import('./GestaoOsCadastrosPageClient'), {
  ssr: false,
  loading: () => (
    <Loading message="Carregando Sistema de Gestão de OS..." fullScreen size="lg" />
  )
});

export default function GestaoOsCadastrosPage() {
  return <GestaoOsCadastrosPageClient />;
}
