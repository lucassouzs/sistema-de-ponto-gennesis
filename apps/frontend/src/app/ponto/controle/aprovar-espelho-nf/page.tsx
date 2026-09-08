import { redirect } from 'next/navigation';

/** Chave de permissão sem página própria — aprovações de espelho na tela global de Aprovações. */
export default function ControleAprovarEspelhoNfRedirectPage() {
  redirect('/ponto/aprovacoes');
}
