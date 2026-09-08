import { redirect } from 'next/navigation';

/** Chave de permissão sem página própria — edição ocorre em Funcionários. */
export default function ControleAlterarPermissoesRedirectPage() {
  redirect('/ponto/funcionarios');
}
