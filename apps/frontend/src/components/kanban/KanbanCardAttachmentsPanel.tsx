'use client';

import { MessageSquare, Paperclip } from 'lucide-react';
import { clsx } from 'clsx';

export function KanbanCardActivityMeta({
  comments,
  attachments,
  className,
}: {
  comments: number;
  attachments: number;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400', className)}>
      <span className="inline-flex items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
        {comments} {comments === 1 ? 'comentário' : 'comentários'}
      </span>
      <span className="inline-flex items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <Paperclip className="w-3.5 h-3.5 shrink-0" />
        {attachments} {attachments === 1 ? 'anexo' : 'anexos'}
      </span>
    </div>
  );
}
