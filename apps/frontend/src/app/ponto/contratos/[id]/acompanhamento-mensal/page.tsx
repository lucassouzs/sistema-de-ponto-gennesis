'use client';

import { FileText } from 'lucide-react';
import {
  ContratoAcompanhamentoListPage,
  type ContratoAcompanhamentoListConfig,
} from '@/components/contract/ContratoAcompanhamentoListPage';

const CONFIG: ContratoAcompanhamentoListConfig = {
  kind: 'mensal',
  pageTitle: 'Relatório Mensal',
  sectionTitle: 'Relatório mensal',
  sectionDescription:
    'Preenchimento mensal feito pela equipe do contrato. Configure o formulário e registre o mês atual.',
  Icon: FileText,
  periodColumnLabel: 'Mês',
  searchPlaceholder: 'Buscar por mês ou responsável...',
  emptyMessage:
    'Nenhum relatório mensal ainda. Configure o formulário e clique em "Preencher mês atual".',
  configModalTitle: 'Formulário do relatório mensal',
  configModalDescription:
    'Escolha o formulário mensal deste contrato. Os templates vêm de Cadastros → Formulários.',
  fillButtonLabel: 'Preencher mês atual',
  fillButtonContinueLabel: 'Continuar mês atual',
  currentPeriodSummaryLabel: 'Mês atual',
  recordsCountLabel: (count) =>
    `${count} ${count === 1 ? 'mês registrado' : 'meses registrados'}`,
  saveSuccessToast: 'Formulário do relatório mensal configurado!',
  openSuccessToast: 'Mês atual aberto para preenchimento.',
};

export default function AcompanhamentoMensalPage() {
  return <ContratoAcompanhamentoListPage config={CONFIG} />;
}
