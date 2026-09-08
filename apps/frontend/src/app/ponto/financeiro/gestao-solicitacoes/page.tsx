'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FluigSolicitacoesPage } from '@/components/fluig/FluigSolicitacoesPage';

export default function GestaoSolicitacoesFinanceiroPage() {
  return (
    <ProtectedRoute route="/ponto/financeiro/gestao-solicitacoes">
      <FluigSolicitacoesPage
        config={{
          title: 'Fluig - Processos',
          subtitle: 'Acompanhe em tempo real as solicitações do Fluig na visão financeira',
          datasets: ['DataSet_G3FollowUp', 'DataSet_G4FollowUp', 'G5-Relatorio-DF-GO-TODOS-SETORES'],
          datasetTabLabels: {
            DataSet_G3FollowUp: 'G3',
            DataSet_G4FollowUp: 'G4',
            'G5-Relatorio-DF-GO-TODOS-SETORES': 'G5',
          },
          g5TitleDatasets: ['G5-Relatorio-DF-GO-TODOS-SETORES'],
          allowedFiliais: null,
          allowedFiliaisDatasets: ['DataSet_G3FollowUp'],
          excludedFiliais: ['FILIAL PB'],
          hideFilialFilter: true,
          showProcessCard: true,
          useEmployeeListLayout: true,
          showExportButton: true,
          leadTimeColumn: 'Início Data',
        }}
      />
    </ProtectedRoute>
  );
}
