'use client';

import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import {
  searchConstructionMaterials,
  type ConstructionMaterialListItem,
} from '@/lib/fetchAllConstructionMaterials';

export type ConstructionMaterialSearchDropdownProps = {
  value: string;
  selectedLabel?: string;
  onChange: (materialId: string, material: ConstructionMaterialListItem) => void;
  disabled?: boolean;
  placeholder?: string;
  noFocusRing?: boolean;
  stayOpenOnSelect?: boolean;
  selectedIds?: string[];
};

export function ConstructionMaterialSearchDropdown({
  value,
  selectedLabel,
  onChange,
  disabled,
  placeholder = 'Digite para buscar material...',
  noFocusRing,
  stayOpenOnSelect,
  selectedIds,
}: ConstructionMaterialSearchDropdownProps) {
  return (
    <AsyncSearchSelectDropdown<ConstructionMaterialListItem>
      value={value}
      selectedLabel={selectedLabel}
      onChange={(material) => onChange(material.id, material)}
      searchFn={searchConstructionMaterials}
      getOptionId={(m) => m.id}
      getOptionLabel={(m) => m.name}
      disabled={disabled}
      placeholder={placeholder}
      noFocusRing={noFocusRing}
      queryKeyPrefix="construction-materials-search"
      stayOpenOnSelect={stayOpenOnSelect}
      selectedIds={selectedIds}
    />
  );
}
