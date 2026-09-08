import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsTiposServicoPageClient = dynamic(
  () => import('./GestaoOsTiposServicoPageClient'),
  {
    ssr: false,
    loading: () => <Loading message="Carregando tipos de serviço..." fullScreen size="lg" />
  }
);

export default function GestaoOsTiposServicoPage() {
  return <GestaoOsTiposServicoPageClient />;
}
