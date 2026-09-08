/**
 * Qualquer usuário autenticado pode adicionar/excluir itens do checklist
 * de análise de licitações.
 */
export function canManageLicitacaoChecklist(_email?: string | null): boolean {
  return true;
}
