'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { formatFluigCellValue } from '@/lib/fluigCellValue';
import { getWorkflowSectorsForDataset, type ParsedWorkflowRow } from '@/lib/fluigWorkflowApproval';
import { WorkflowApprovalStepCard } from '@/components/fluig/fluigWorkflowStepStatus';

type FluigWorkflowRequestDetailModalProps = {
  row: ParsedWorkflowRow | null;
  onClose: () => void;
};

export function FluigWorkflowRequestDetailModal({ row, onClose }: FluigWorkflowRequestDetailModalProps) {
  const visibleSectors = row ? getWorkflowSectorsForDataset(row.datasetId ?? '') : [];

  return (
    <Modal
      isOpen={row != null}
      onClose={onClose}
      title={row ? `Processo ${row.processId}` : 'Detalhes'}
      size="xl"
    >
      {row ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.title}</p>
            {row.filial ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Filial: {row.filial}</p>
            ) : null}
            {row.currentStage ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Etapa atual: {row.currentStage}
              </p>
            ) : null}
          </div>

          <div
            className={`grid gap-3 ${visibleSectors.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
          >
            {row.steps
              .filter((step) => visibleSectors.includes(step.sector))
              .map((step) => (
                <WorkflowApprovalStepCard key={step.sector} step={step} />
              ))}
          </div>

          <div
            className="max-h-[40vh] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 dark:border-gray-700 app-thin-scroll"
          >
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(row.raw).map(([key, val]) => (
                  <tr key={key} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="whitespace-nowrap bg-gray-50 px-3 py-2 font-medium text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                      {key}
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      {formatFluigCellValue(val) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
