'use client';

// Deploy trigger: 2026-07-13-login-opts
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { ToasterWrapper } from '@/components/ui/ToasterWrapper';
import { Favicon } from '@/components/Favicon';
import { APP_TITLE } from '@/lib/pageTitle';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <title>{APP_TITLE}</title>
        <meta name="description" content="Plataforma integrada de gestão da Gennesis Engenharia" />
        <meta name="keywords" content="ponto, frequência, engenharia, controle, horas" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/logopv.png" type="image/png" />
        <link rel="shortcut icon" href="/logopv.png" type="image/png" />
      </head>
      <body className={inter.className}>
        <Providers>
          <Favicon />
          {children}
          <div id="dropdown-portal-root" />
        </Providers>
        <ToasterWrapper />
      </body>
    </html>
  );
}
