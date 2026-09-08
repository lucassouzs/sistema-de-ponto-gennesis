import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const RecebimentoEntregasPageClient = dynamic(
  () => import('./RecebimentoEntregasPageClient'),
  {
    ssr: false,
    loading: () => <Loading message="Carregando recebimento de entregas..." fullScreen size="lg" />,
  }
);

export default function RecebimentoEntregasPage() {
  return <RecebimentoEntregasPageClient />;
}
