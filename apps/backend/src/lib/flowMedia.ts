import { prisma } from './prisma';

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;

export function isWhatsAppSavedMediaReady(
  hasMedia: boolean,
  saved: { fileUrl?: string | null; fileKey?: string | null } | null | undefined,
): boolean {
  if (!hasMedia || !saved) return false;
  return Boolean((saved.fileUrl || '').trim() || (saved.fileKey || '').trim());
}

export function hasStoredPhoto(
  url?: string | null | unknown,
  key?: string | null | unknown,
): boolean {
  return Boolean(String(url || '').trim() || String(key || '').trim());
}

function isImageAttachment(att: { mimeType?: string | null; fileName?: string | null }): boolean {
  const mime = (att.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (att.fileName || '').toLowerCase();
  return IMAGE_EXT.test(name);
}

export async function getPhotoAttachmentFromMessage(messageId: string) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!msg?.attachments?.length) return null;
  return msg.attachments.find(isImageAttachment) ?? msg.attachments[0];
}
