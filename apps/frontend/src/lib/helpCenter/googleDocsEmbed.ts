/** Converte URL do Google Docs/Drive em URL embutível (preview). */

export function toGoogleDocsEmbedUrl(raw: string): string | null {
  const input = String(raw || '').trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('docs.google.com') && !host.endsWith('drive.google.com')) {
      return null;
    }

    // https://docs.google.com/document/d/{id}/edit|view|preview|pub
    const docMatch = url.pathname.match(/\/document\/d\/([^/]+)/);
    if (docMatch?.[1]) {
      return `https://docs.google.com/document/d/${docMatch[1]}/preview`;
    }

    // https://drive.google.com/file/d/{id}/view
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }

    // https://drive.google.com/open?id=...
    const openId = url.searchParams.get('id');
    if (openId) {
      return `https://drive.google.com/file/d/${openId}/preview`;
    }

    return url.toString();
  } catch {
    return null;
  }
}
