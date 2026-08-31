'use client';

import { Video } from 'lucide-react';
import {
  ContratoAcompanhamentoListPage,
  type ContratoAcompanhamentoListConfig,
} from '@/components/contract/ContratoAcompanhamentoListPage';

const CONFIG: ContratoAcompanhamentoListConfig = {
  kind: 'semanal',
  pageTitle: 'Reuniões Quinzenais',
  sectionTitle: 'Histórico quinzenal',
  sectionDescription: 'Reuniões quinzenais registradas para este contrato.',
  Icon: Video,
  periodColumnLabel: 'Quinzena',
  searchPlaceholder: 'Buscar por quinzena ou responsável...',
  emptyMessage:
    'Nenhuma reunião quinzenal ainda. Configure o formulário no painel de Métricas e registre a reunião da quinzena.',
  configModalTitle: 'Formulário de reunião quinzenal',
  configModalDescription:
    'Escolha o formulário usado nas reuniões quinzenais deste contrato. Você também pode atribuir em Métricas → Relatórios de Contrato.',
  fillButtonLabel: 'Registrar reunião da quinzena',
  fillButtonContinueLabel: 'Continuar reunião da quinzena',
  currentPeriodSummaryLabel: 'Quinzena atual',
  recordsCountLabel: (count) =>
    `${count} ${count === 1 ? 'quinzena registrada' : 'quinzenas registradas'}`,
  saveSuccessToast: 'Formulário de reunião quinzenal configurado!',
  openSuccessToast: 'Reunião da quinzena aberta para registro.',
  backHref: () => '/ponto/metricas/relatorios-contrato',
  backLabel: 'Voltar ao painel',
  protectedRoute: '/ponto/metricas/relatorios-contrato',
};

export default function RelatorioContratoDetalhePage() {
  return <ContratoAcompanhamentoListPage config={CONFIG} />;
}
