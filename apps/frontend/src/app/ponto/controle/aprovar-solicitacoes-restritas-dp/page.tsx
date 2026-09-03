import { redirect } from 'next/navigation';

/** Chave de permissão sem página própria — aprovações restritas na tela global de Aprovações. */
export default function ControleAprovarSolicitacoesRestritasDpRedirectPage() {
  redirect('/ponto/aprovacoes');
}
