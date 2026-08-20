import { redirect } from 'next/navigation';

/**
 * A sessão JWT fica no browser (localStorage/sessionStorage).
 * Sempre encaminha para o app; o client decide se restaura ou manda ao login.
 */
export default function HomePage() {
  redirect('/ponto/home');
}
