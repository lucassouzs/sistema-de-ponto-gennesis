import { redirect } from 'next/navigation';

/** Rota legada: chamados ficam na Central de Atendimentos. */
export default function SuporteTiRedirectPage() {
  redirect('/ponto/conversas-whatsapp');
}
