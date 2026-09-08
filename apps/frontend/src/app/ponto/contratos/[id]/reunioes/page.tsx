'use client';

import { Video } from 'lucide-react';
import {
  ContratoAcompanhamentoListPage,
  type ContratoAcompanhamentoListConfig,
} from '@/components/contract/ContratoAcompanhamentoListPage';

const CONFIG: ContratoAcompanhamentoListConfig = {
  kind: 'semanal',
  pageTitle: 'Reuniões Quinzenais',
  sectionTitle: 'Reuniões Quinzenais',
  sectionDescription:
    'Configure o formulário usado nas reuniões gravadas com a equipe do contrato.',
  Icon: Video,
  periodColumnLabel: 'Quinzena',
  searchPlaceholder: 'Buscar por quinzena ou responsável...',
  emptyMessage:
    'Nenhuma reunião registrada ainda. Configure o formulário e clique em "Registrar reunião da quinzena".',
  configModalTitle: 'Formulário de reunião quinzenal',
  configModalDescription:
    'Escolha o formulário usado nas reuniões quinzenais gravadas com a equipe do contrato. Os templates vêm de Cadastros → Formulários.',
  fillButtonLabel: 'Registrar reunião da quinzena',
  fillButtonContinueLabel: 'Continuar reunião da quinzena',
  currentPeriodSummaryLabel: 'Quinzena atual',
  recordsCountLabel: (count) =>
    `${count} ${count === 1 ? 'quinzena registrada' : 'quinzenas registradas'}`,
  saveSuccessToast: 'Formulário de reunião quinzenal configurado!',
  openSuccessToast: 'Reunião da quinzena aberta para registro.',
};

export default function ContratoReunioesPage() {
  return <ContratoAcompanhamentoListPage config={CONFIG} />;
}
