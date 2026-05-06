'use client';

export const dynamic = 'force-dynamic';

import { FluigSolicitacoesPage } from '@/components/fluig/FluigSolicitacoesPage';

export default function GestaoSolicitacoesFinanceiroPage() {
  return (
    <FluigSolicitacoesPage
      config={{
        title: 'Painel de solicitações',
        subtitle: 'Acompanhe em tempo real as solicitações do Fluig na visão financeira',
        datasets: ['DataSet_G3FollowUp', 'DataSet_G4FollowUp', 'G5-Relatorio-DF'],
        datasetTabLabels: {
          DataSet_G3FollowUp: 'G3',
          DataSet_G4FollowUp: 'G4',
          'G5-Relatorio-DF': 'G5',
        },
        g5TitleDatasets: ['G5-Relatorio-DF'],
        allowedFiliais: null,
        allowedFiliaisDatasets: ['DataSet_G3FollowUp'],
        excludedFiliais: ['FILIAL PB'],
        hideFilialFilter: true,
        showProcessCard: true,
        fixedRecordsPerPage: 50,
        hideRecordsPerPageSelector: true,
        useEmployeeListLayout: true,
        showExportButton: true,
        leadTimeColumn: 'Início Data',
      }}
    />
  );
}
