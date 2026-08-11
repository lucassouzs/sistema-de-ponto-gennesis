/** @type {import('next').NextConfig} */
// Turbopack (`next dev --turbo`) não suporta `experimental.esmExternals`.
// Mantemos a opção apenas no modo webpack (dev normal e build de produção).
const isTurbopack = !!process.env.TURBOPACK;

const nextConfig = {
  transpilePackages: ['recharts'],
  env: {
    TZ: 'America/Sao_Paulo',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  },
  images: { unoptimized: true },
  experimental: {
    ...(isTurbopack ? {} : { esmExternals: 'loose' }),
    // Equivalente Turbopack dos aliases do webpack abaixo (usado em `next dev --turbo`).
    turbo: {
      resolveAlias: {
        'victory-vendor/d3-scale': 'd3-scale',
        'victory-vendor/d3-shape': 'd3-shape',
      },
    },
  },
  compiler: { styledComponents: false },
  swcMinify: true,
  reactStrictMode: false,
  /** Railway/CI: id estável por commit evita rebuild total a cada deploy (menos tempo e menos OOM). Dev local pode variar por timestamp se não houver GIT SHA. */
  generateBuildId: async () =>
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice?.(0, 12) ||
    process.env.GITHUB_SHA?.slice?.(0, 12) ||
    `local-${Date.now()}`,
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  /** Cadastros do espelho NF: URLs antigas (sob /espelho-nf/) redirecionam para rotas em /ponto/. */
  async redirects() {
    return [
      {
        source: '/ponto/dashboard',
        destination: '/ponto/painel-do-sistema',
        permanent: true,
      },
      {
        source: '/ponto/espelho-nf/codigos-tributarios',
        destination: '/ponto/codigos-tributarios',
        permanent: true
      },
      {
        source: '/ponto/espelho-nf/prestadores-servico',
        destination: '/ponto/prestadores-servico',
        permanent: true
      },
      {
        source: '/ponto/espelho-nf/tomadores-servico',
        destination: '/ponto/tomadores-servico',
        permanent: true
      },
      {
        source: '/ponto/espelho-nf/contas-bancarias',
        destination: '/ponto/contas-bancarias',
        permanent: true
      }
    ];
  },
  webpack: (config) => {
    // Recharts importa victory-vendor/d3-*; o Webpack nem sempre resolve subpaths do pacote no monorepo.
    // Redireciona para os pacotes d3 oficiais (mesma API que o victory-vendor reexporta).
    config.resolve.alias = {
      ...config.resolve.alias,
      'victory-vendor/d3-scale': require.resolve('d3-scale'),
      'victory-vendor/d3-shape': require.resolve('d3-shape'),
    };
    return config;
  },
};

module.exports = nextConfig;
