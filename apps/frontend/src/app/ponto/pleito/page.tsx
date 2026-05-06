import { redirect } from 'next/navigation';

/** Rota antiga — módulo renomeado para Ordem de Serviço */
export default function PleitoRedirectPage() {
  redirect('/ponto/andamento-da-os');
}
