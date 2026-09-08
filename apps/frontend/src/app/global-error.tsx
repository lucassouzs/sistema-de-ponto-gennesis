'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40 }}>
        <h1>Algo deu errado</h1>
        <p>{error?.message || 'Erro inesperado'}</p>
        <button type="button" onClick={() => reset()}>
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
