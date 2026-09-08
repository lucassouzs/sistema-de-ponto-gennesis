'use client';

// Deploy trigger: 2026-07-13-login-opts
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { ToasterWrapper } from '@/components/ui/ToasterWrapper';
import { Favicon } from '@/components/Favicon';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <title>Gennesis Conecta | Plataforma de Gestão Gennesis Engenharia</title>
        <meta name="description" content="Gennesis Conecta é a plataforma integrada de gestão da Gennesis Engenharia: ponto, frequência, financeiro, licitações e muito mais em um só lugar." />
        <meta name="keywords" content="gennesis conecta, gennesis engenharia, ponto, frequência, engenharia, controle, horas, sistema de gestão" />
        <meta name="robots" content="index, follow" />
        <meta name="google-site-verification" content="8G3AX5qUg4QPPea1ghF6fZL0teE8VA2mnf9I-6obkoQ" />
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
