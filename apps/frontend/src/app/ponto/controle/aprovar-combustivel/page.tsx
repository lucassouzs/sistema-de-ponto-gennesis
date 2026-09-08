import { redirect } from 'next/navigation';

/** Chave de permissão sem página própria — aprovações de combustível na tela global de Aprovações. */
export default function ControleAprovarCombustivelRedirectPage() {
  redirect('/ponto/aprovacoes');
}
