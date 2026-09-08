import { redirect } from 'next/navigation';

/** Chave de permissão sem página própria — fluxo ligado a solicitações gerais (DP). */
export default function ControleCriarTiposRestritosDpRedirectPage() {
  redirect('/ponto/gerenciar-solicitacoes-dp');
}
