'use client';

import React from 'react';
import { splitTextWithMentions } from '@/lib/chatMentions';

export function MentionHighlightedText({
  text,
  className = '',
  mentionClassName = 'font-medium text-red-600 dark:text-red-400',
}: {
  text: string;
  className?: string;
  mentionClassName?: string;
}) {
  const segments = splitTextWithMentions(text);
  if (!segments.length) return null;

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <span key={i} className={mentionClassName}>
            {seg.value}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </span>
  );
}
