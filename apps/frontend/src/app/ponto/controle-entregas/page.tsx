import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const ControleEntregasPageClient = dynamic(
  () => import('./ControleEntregasPageClient'),
  {
    ssr: false,
    loading: () => <Loading message="Carregando controle de entregas..." fullScreen size="lg" />,
  }
);

export default function ControleEntregasPage() {
  return <ControleEntregasPageClient />;
}
