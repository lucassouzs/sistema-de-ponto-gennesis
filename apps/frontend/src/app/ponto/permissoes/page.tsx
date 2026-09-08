import { redirect } from 'next/navigation';

/** Rota descontinuada — permissões de usuário são editadas em Funcionários (ou modelo por cargo em Contratos). */
export default function PermissoesRedirectPage() {
  redirect('/ponto/funcionarios');
}
