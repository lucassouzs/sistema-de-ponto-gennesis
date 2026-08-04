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

export function isSetorAsoValido(setor: string): boolean {
  const n = normalizeAsoKey(setor);
  return ASO_SETORES.some((s) => normalizeAsoKey(s) === n);
}

export function canonicalizeSetorAso(setor: string): string {
  const n = normalizeAsoKey(setor);
  const found = ASO_SETORES.find((s) => normalizeAsoKey(s) === n);
  return found || setor.trim();
}

/**
 * Unifica "Assistente"+"Engenharia" e "Assistente de Engenharia"+"Engenharia"
 * (e o mesmo padrão para qualquer cargo).
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

export function labelFuncaoFromEmployee(
  position: string | null | undefined,
  department: string | null | undefined
): string {
  const { cargo, setor } = normalizeCargoSetorAso(position, department);
  return labelFuncaoAso(cargo, setor) || cargo;
}
