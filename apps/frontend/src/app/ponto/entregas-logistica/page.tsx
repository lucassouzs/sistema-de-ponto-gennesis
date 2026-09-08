import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const EntregasLogisticaPageClient = dynamic(
  () => import('./EntregasLogisticaPageClient'),
  {
    ssr: false,
    loading: () => <Loading message="Carregando entregas logística..." fullScreen size="lg" />,
  }
);

export default function EntregasLogisticaPage() {
  return <EntregasLogisticaPageClient />;
}
