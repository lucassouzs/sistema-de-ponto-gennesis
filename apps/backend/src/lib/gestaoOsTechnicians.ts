/** Quem pode ser atribuído como técnico de OS (exclui admin do sistema e bot). */
export function isAssignableGestaoOsTechnician(user: {
  name: string;
  email: string;
  employee?: { position: string } | null;
}): boolean {
  const name = user.name.trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  const position = (user.employee?.position || '').trim().toLowerCase();
  if (name === 'administrador' || name === 'admin' || position === 'administrador') return false;
  if (name === 'gennecy' || email.startsWith('gennecy-bot@') || email.includes('gennecy-bot')) {
    return false;
  }
  return true;
}
