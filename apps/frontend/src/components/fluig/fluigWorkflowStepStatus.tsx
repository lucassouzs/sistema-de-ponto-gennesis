'use client';

import React from 'react';
import {
  extractPersonFromCellValue,
  formatWorkflowApprovalDateDisplay,
  type ParsedWorkflowRow,
  type WorkflowStepStatus,
} from '@/lib/fluigWorkflowApproval';

export function stepStatusBadgeClass(status: WorkflowStepStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'waiting':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
  }
}

export function pendingWithBadgeClass(statusClassName: string): string {
  if (/green/.test(statusClassName)) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (/amber/.test(statusClassName)) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

export function stepStatusLabel(status: WorkflowStepStatus): string {
  switch (status) {
    case 'approved':
      return 'Aprovado';
    case 'pending':
      return 'Pendente';
    case 'rejected':
      return 'Rejeitado';
    case 'waiting':
      return 'Aguardando';
    default:
      return '—';
  }
}

function extractPersonName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/\(([^)]+)\)/);
  if (match?.[1]?.trim()) return match[1].trim();
  return trimmed;
}

export function getStepPersonName(step: ParsedWorkflowRow['steps'][number]): string | null {
  if (step.status === 'approved') {
    return (
      extractPersonName(step.approver) ??
      extractPersonFromCellValue(step.detail) ??
      extractPersonFromCellValue(step.pendingWith)
    );
  }

  if (step.status === 'pending') {
    return extractPersonName(step.pendingWith) ?? extractPersonFromCellValue(step.detail);
  }

  if (step.status === 'rejected') {
    return extractPersonName(step.approver ?? step.pendingWith);
  }

  return null;
}

export function StatusPersonCell({
  status,
  person,
  statusClassName = 'text-gray-700 dark:text-gray-300',
  asBadge = false,
}: {
  status: string;
  person?: string | null;
  statusClassName?: string;
  asBadge?: boolean;
}) {
  const badgeClass = asBadge ? pendingWithBadgeClass(statusClassName) : statusClassName;

  return (
    <div className="flex flex-col items-center space-y-1 text-center">
      <span
        className={`inline-flex max-w-full whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
      >
        {status}
      </span>
      {person ? <p className="text-xs text-gray-500 dark:text-gray-400">{person}</p> : null}
    </div>
  );
}

export function ApprovalStepCell({ step }: { step: ParsedWorkflowRow['steps'][number] }) {
  return (
    <div className="space-y-1">
      <StatusPersonCell
        status={stepStatusLabel(step.status)}
        person={getStepPersonName(step)}
        statusClassName={stepStatusBadgeClass(step.status)}
      />
      {step.status === 'approved' && step.approvedAt ? (
        <p className="text-center text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          {formatWorkflowApprovalDateDisplay(step.approvedAt)}
        </p>
      ) : null}
    </div>
  );
}

export function WorkflowApprovalStepCard({ step }: { step: ParsedWorkflowRow['steps'][number] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {step.label}
      </p>
      <div className="mt-3 flex justify-center">
        <StatusPersonCell
          status={stepStatusLabel(step.status)}
          person={getStepPersonName(step)}
          statusClassName={stepStatusBadgeClass(step.status)}
        />
      </div>
      {step.status === 'approved' && step.approvedAt ? (
        <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
          {formatWorkflowApprovalDateDisplay(step.approvedAt)}
        </p>
      ) : null}
    </div>
  );
}
