import { redirect } from 'next/navigation';

/** Chave de permissão sem página própria — alteração de senha na lista de Funcionários. */
export default function ControleAlterarSenhaFuncionariosRedirectPage() {
  redirect('/ponto/funcionarios');
}
