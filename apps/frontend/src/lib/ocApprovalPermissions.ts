import { pathToModuleKey } from '@sistema-ponto/permission-modules';

export const OC_APPROVE_COMPRAS_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-compras');
export const OC_APPROVE_GESTOR_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-gestor');
export const OC_APPROVE_DIRETORIA_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-diretoria');

export type OcApprovalPhase = 'compras' | 'gestor' | 'diretoria';

export function ocApprovalPhaseFromStatus(status: string): OcApprovalPhase | null {
  if (status === 'PENDING_COMPRAS' || status === 'DRAFT') return 'compras';
  if (status === 'PENDING') return 'gestor';
  if (status === 'PENDING_DIRETORIA') return 'diretoria';
  return null;
}

export function canActOnOcApprovalStatus(
  status: string,
  perms: {
    isAdministrator?: boolean;
    canApproveOcCompras: boolean;
    canApproveOcGestor: boolean;
    canApproveOcDiretoria: boolean;
  }
): boolean {
  if (perms.isAdministrator) return true;
  const phase = ocApprovalPhaseFromStatus(status);
  if (!phase) return false;
  if (phase === 'compras') return perms.canApproveOcCompras;
  if (phase === 'gestor') return perms.canApproveOcGestor;
  return perms.canApproveOcDiretoria;
}
