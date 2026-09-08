import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const EntregaLogisticaPageClient = dynamic(
  () => import('./EntregaLogisticaPageClient'),
  {
    ssr: false,
    loading: () => <Loading message="Carregando entrega da logística..." fullScreen size="lg" />,
  }
);

export default function EntregaLogisticaPage() {
  return <EntregaLogisticaPageClient />;
}
