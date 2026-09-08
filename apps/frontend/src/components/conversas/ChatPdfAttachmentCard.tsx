'use client';

import clsx from 'clsx';
import { FileText } from 'lucide-react';
import { ChatPdfPagePreview, PDF_ATTACHMENT_WIDTH, PDF_PREVIEW_MAX_HEIGHT } from '@/components/conversas/ChatPdfPagePreview';
import {
  ownChatAttachmentCardClass,
  ownChatAttachmentIconClass,
  ownChatMetaTextClass,
} from '@/components/conversas/chatBubbleTheme';

type ChatPdfAttachmentCardProps = {
  src: string;
  fileName: string;
  fileKey?: string | null;
  fileSize?: number | null;
  typeLabel: string;
  isOwn: boolean;
  reserveCornerForMeta?: boolean;
  onOpen: () => void;
};

export function ChatPdfAttachmentCard({
  src,
  fileName,
  fileKey,
  fileSize,
  typeLabel,
  isOwn,
  reserveCornerForMeta,
  onOpen,
}: ChatPdfAttachmentCardProps) {
  return (
    <div
      className={clsx(
        'shrink-0 cursor-pointer overflow-hidden rounded-xl border',
        isOwn
          ? ownChatAttachmentCardClass
          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/70'
      )}
      style={{ width: PDF_ATTACHMENT_WIDTH, maxWidth: '100%' }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="link"
      tabIndex={0}
      title="Abrir PDF"
    >
      <ChatPdfPagePreview
        src={src}
        fileName={fileName}
        fileKey={fileKey}
        className={clsx(
          'border-b',
          isOwn ? 'border-gray-300/70 dark:border-gray-600' : 'border-gray-200 dark:border-gray-700'
        )}
        maxHeight={PDF_PREVIEW_MAX_HEIGHT}
      />
      <div
        className={clsx(
          'flex items-center gap-3 p-3',
          reserveCornerForMeta && 'pb-4'
        )}
      >
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            isOwn
              ? ownChatAttachmentIconClass
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
          )}
        >
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={fileName}>
            {fileName}
          </p>
          <p
            className={clsx(
              'mt-0.5 truncate text-xs',
              isOwn ? ownChatMetaTextClass : 'text-gray-500 dark:text-gray-400'
            )}
          >
            {typeLabel}
            {fileSize ? ` - ${formatFileSize(fileSize)}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
