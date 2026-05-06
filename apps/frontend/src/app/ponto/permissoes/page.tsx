import { redirect } from 'next/navigation';

/** Rota descontinuada — permissões por cargo são geridas no fluxo de funcionários/contratos. */
export default function PermissoesRedirectPage() {
  redirect('/ponto/dashboard');
}
