/** Setores iguais ao cadastro de funcionários. */
export const ASO_SETORES = [
  'Projetos',
  'Contratos e Licitações',
  'Suprimentos',
  'Jurídico',
  'Departamento Pessoal',
  'Engenharia',
  'Administrativo',
  'Financeiro',
  'Operacional',
  'Segurança do Trabalho',
  'Sócios',
] as const;

/** Cargos genéricos que montam o rótulo "{Cargo} de {Setor}". */
export const ASO_CARGOS_COMPOEM_SETOR = new Set(
  [
    'Assistente',
    'Analista',
    'Auxiliar',
    'Coordenador(a)',
    'Técnico',
    'Estagiário(a)',
    'Gerente',
    'Supervisor',
    'Engenheiro',
    'Orçamentista',
    'Almoxarife',
    'Comprador jr',
    'Serviços administrativos',
    'Jovem aprendiz',
  ].map((c) => c.trim().toLowerCase())
);

export function normalizeAsoKey(value: string): string {
  return value.trim().toLowerCase();
}

export function cargoRiscoPairKey(cargo: string, setor: string): string {
  return `${normalizeAsoKey(cargo)}|||${normalizeAsoKey(setor)}`;
}

export function isSetorAsoValido(setor: string): boolean {
  const n = normalizeAsoKey(setor);
  return ASO_SETORES.some((s) => normalizeAsoKey(s) === n);
}

/** Normaliza grafia do setor para o valor canônico da lista, se existir. */
export function canonicalizeSetorAso(setor: string): string {
  const n = normalizeAsoKey(setor);
  const found = ASO_SETORES.find((s) => normalizeAsoKey(s) === n);
  return found || setor.trim();
}

/**
 * Unifica cadastros inconsistentes:
 * - "Assistente" + "Engenharia"
 * - "Assistente de Engenharia" + "Engenharia"
 * → ambos viram cargo "Assistente" + setor "Engenharia".
 *
 * Aplica a qualquer cargo no padrão "{Cargo} de {Setor}" quando o sufixo
 * coincide com o departamento (ou é um setor conhecido).
 */
export function normalizeCargoSetorAso(
  position: string | null | undefined,
  department: string | null | undefined
): { cargo: string; setor: string } {
  let cargo = String(position || '').trim();
  let setor = String(department || '').trim();
  if (!cargo) return { cargo: '', setor: setor ? canonicalizeSetorAso(setor) : '' };

  const m = /^(.+?)\s+de\s+(.+)$/i.exec(cargo);
  if (m) {
    const base = m[1].trim();
    const suffix = m[2].trim();
    const suffixNorm = normalizeAsoKey(suffix);
    const setorNorm = normalizeAsoKey(setor);

    if (setor && suffixNorm === setorNorm) {
      cargo = base;
      setor = canonicalizeSetorAso(setor);
    } else if (!setor && isSetorAsoValido(suffix)) {
      cargo = base;
      setor = canonicalizeSetorAso(suffix);
    } else if (
      setor &&
      isSetorAsoValido(suffix) &&
      (setorNorm === suffixNorm ||
        setorNorm.startsWith(suffixNorm + ' ') ||
        setorNorm.startsWith(suffixNorm + ' de') ||
        setorNorm.includes(suffixNorm))
    ) {
      cargo = base;
      setor = canonicalizeSetorAso(suffix);
    }
  } else if (setor) {
    setor = canonicalizeSetorAso(setor);
  }

  return { cargo, setor };
}

/**
 * Rótulo da função no ASO:
 * - cargos genéricos → "Assistente de Engenharia"
 * - demais (obra/especialidade) → nome do cargo puro
 */
export function labelFuncaoAso(cargo: string, setor: string): string {
  const c = (cargo || '').trim();
  const s = (setor || '').trim();
  if (!c) return '';
  if (!s) return c;
  if (ASO_CARGOS_COMPOEM_SETOR.has(normalizeAsoKey(c))) {
    return `${c} de ${s}`;
  }
  return c;
}

/** Rótulo a partir do cadastro do funcionário (já unificando "X" + "Y" e "X de Y"). */
export function labelFuncaoFromEmployee(
  position: string | null | undefined,
  department: string | null | undefined
): string {
  const { cargo, setor } = normalizeCargoSetorAso(position, department);
  return labelFuncaoAso(cargo, setor) || cargo;
}
