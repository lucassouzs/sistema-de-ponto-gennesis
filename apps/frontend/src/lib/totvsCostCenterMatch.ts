/**
 * Correspondência entre valor de CC no RM (código hierárquico) e cadastro do sistema.
 * Espelha a lógica de TotvsRmRelatorioFinService (cellMatchesCostCenter).
 */

export type CostCenterMatchTarget = {
  code?: string;
  name?: string;
};

function normCcCell(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[\u00A0\u2000-\u200B\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ');
}

function codeFragmentBoundaryOk(before: string | undefined, after: string | undefined): boolean {
  const continuesCode = (ch: string | undefined) => ch !== undefined && ch !== '' && /[0-9.]/.test(ch);
  return !continuesCode(before) && !continuesCode(after);
}

const NAME_SUBSTR_MIN_LEN = 7;

/** Valor da célula RM bate com código e/ou nome do centro de custo cadastrado. */
export function cellMatchesCostCenter(
  rawRmValue: string,
  code: string,
  name: string
): boolean {
  const c = normCcCell(String(rawRmValue ?? ''));
  if (!c) return false;
  const nc = normCcCell(code).trim();
  const nn = normCcCell(name).trim();

  if (nc && c === nc) return true;
  if (nn && c === nn) return true;

  if (nc.length >= 3) {
    let from = 0;
    while ((from = c.indexOf(nc, from)) !== -1) {
      const before = from > 0 ? c[from - 1] : undefined;
      const after = from + nc.length < c.length ? c[from + nc.length] : undefined;
      if (codeFragmentBoundaryOk(before, after)) return true;
      from += 1;
    }
    if (c.startsWith(`${nc} `) || c.startsWith(`${nc}-`) || c.startsWith(`${nc}/`)) return true;
  }

  if (nn.length >= NAME_SUBSTR_MIN_LEN) {
    const delim = (ch: string | undefined) =>
      ch === undefined || ch === '' || /[\s\-/|,;]/.test(ch) || ch === '\u2013' || ch === '\u2014';
    let from = 0;
    while ((from = c.indexOf(nn, from)) !== -1) {
      const before = from > 0 ? c[from - 1] : undefined;
      const after = from + nn.length < c.length ? c[from + nn.length] : undefined;
      if (delim(before) && delim(after)) return true;
      from += 1;
    }
  }

  return false;
}

/** Encontra o centro de custo do cadastro que corresponde ao CODCCUSTO vindo do RM. */
export function findCostCenterForRmCode(
  rmCodCCusto: string,
  costCenters: CostCenterMatchTarget[]
): (CostCenterMatchTarget & { id?: string }) | null {
  const raw = (rmCodCCusto || '').trim();
  if (!raw) return null;
  for (const cc of costCenters) {
    if (cellMatchesCostCenter(raw, String(cc.code || ''), String(cc.name || ''))) {
      return cc;
    }
  }
  return null;
}

/** Nome para exibir na tabela (nome do cadastro; se não achar, mantém o código RM). */
export function displayCostCenterLabel(
  rmCodCCusto: string,
  costCenters: CostCenterMatchTarget[]
): string {
  const cc = findCostCenterForRmCode(rmCodCCusto, costCenters);
  if (cc?.name?.trim()) return cc.name.trim();
  if (cc?.code?.trim()) return cc.code.trim();
  return rmCodCCusto?.trim() || '—';
}

/** Filtro por id do centro de custo selecionado no cadastro. */
export function extratoMatchesCostCenterId(
  rmCodCCusto: string,
  selectedCostCenterId: string,
  costCenters: Array<CostCenterMatchTarget & { id?: string }>
): boolean {
  if (!selectedCostCenterId) return true;
  const cc = costCenters.find((c) => c.id === selectedCostCenterId);
  if (!cc) return false;
  return cellMatchesCostCenter(rmCodCCusto, String(cc.code || ''), String(cc.name || ''));
}

/** Filtro por um ou mais centros de custo (OR). Sem seleção = todos. */
export function extratoMatchesAnyCostCenterIds(
  rmCodCCusto: string,
  selectedCostCenterIds: string[],
  costCenters: Array<CostCenterMatchTarget & { id?: string }>
): boolean {
  if (!selectedCostCenterIds.length) return true;
  return selectedCostCenterIds.some((id) =>
    extratoMatchesCostCenterId(rmCodCCusto, id, costCenters)
  );
}
