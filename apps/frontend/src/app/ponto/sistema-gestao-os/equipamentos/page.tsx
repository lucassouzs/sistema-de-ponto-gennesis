import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsEquipamentosPageClient = dynamic(
  () => import('./GestaoOsEquipamentosPageClient'),
  {
    ssr: false,
    loading: () => (
      <Loading message="Carregando equipamentos..." fullScreen size="lg" />
    )
  }
);

export default function GestaoOsEquipamentosPage() {
  return <GestaoOsEquipamentosPageClient />;
}
