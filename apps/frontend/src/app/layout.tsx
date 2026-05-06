'use client';

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
        <title>Gennesis Attendance</title>
        <meta name="description" content="Sistema completo para controle de frequência de colaboradores" />
        <meta name="keywords" content="ponto, frequência, engenharia, controle, horas" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logoredonda.png" type="image/png" />
        <link rel="shortcut icon" href="/logoredonda.png" type="image/png" />
      </head>
      <body className={inter.className}>
        <Favicon />
        <Providers>
          {children}
        </Providers>
        <ToasterWrapper />
      </body>
    </html>
  );
}
