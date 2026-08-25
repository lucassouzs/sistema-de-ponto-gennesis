import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

export type PersonSelectSource = {
  value: string;
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
  /** Texto extra para busca (cargo, departamento, centro de custo, etc.). */
  extraSearchText?: string;
};

export function formatPersonCpf(cpf?: string | null): string {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return (cpf || '').trim();
}

export function personInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/** Opção de select com foto + CPF (mesmo padrão de Gestão OS / permissões). */
export function toPersonSelectOption(person: PersonSelectSource): MultiSelectSearchOption {
  const cpfLabel = formatPersonCpf(person.cpf);
  return {
    value: person.value,
    label: person.name,
    description: cpfLabel || undefined,
    searchText: [person.name, person.cpf, cpfLabel, person.extraSearchText]
      .filter(Boolean)
      .join(' '),
    avatarUrl: resolveApiMediaUrl(person.profilePhotoUrl ?? null),
    avatarFallback: personInitials(person.name),
  };
}

export function toPersonSelectOptions(
  people: readonly PersonSelectSource[]
): MultiSelectSearchOption[] {
  return people.map(toPersonSelectOption);
}
