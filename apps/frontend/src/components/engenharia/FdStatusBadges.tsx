'use client';

import React from 'react';
import {
  FD_STATUS_LABELS,
  fdPurchaseStatusBadgeClass,
  fdStatusBadgeClass,
  purchaseStatusLabel,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

const badgeBase = 'inline-flex max-w-[220px] rounded-full px-2.5 py-0.5 text-xs font-semibold';

export function FdStatusBadges({ record }: { record: FichaDemandaApprovalRecord }) {
  if (record.status === 'APPROVED' && record.purchaseStatus) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span
          className={`${badgeBase} ${fdPurchaseStatusBadgeClass(record.purchaseStatus)}`}
          title={purchaseStatusLabel(record.purchaseStatus)}
        >
          {purchaseStatusLabel(record.purchaseStatus)}
        </span>
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Gestor: Aprovada</span>
      </div>
    );
  }

  return (
    <span className={`${badgeBase} ${fdStatusBadgeClass(record.status)}`}>
      {FD_STATUS_LABELS[record.status]}
    </span>
  );
}
