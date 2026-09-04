import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/ponto/', '/dashboard/', '/api/'],
    },
    sitemap: 'https://www.gennesisconecta.com.br/sitemap.xml',
  };
}
