/** Flow liberado para qualquer usuário autenticado (sem permissão na matriz «Acesso»). */
export async function userHasFlowAccess(userId: string, _isAdmin: boolean): Promise<boolean> {
  return Boolean(userId);
}
