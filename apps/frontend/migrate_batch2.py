#!/usr/bin/env python3
"""Migrate remaining select files."""
from pathlib import Path

ROOT = Path(__file__).parent / "src"

def w(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")

def migrate_furo_estoque():
    f = ROOT / "app/ponto/furo-estoque/page.tsx"
    text = f.read_text(encoding="utf-8")
    if "StringSingleSelectDropdown" not in text:
        text = text.replace(
            "import toast from 'react-hot-toast';\n",
            "import toast from 'react-hot-toast';\nimport { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';\nimport { labeledToSelectOptions } from '@/lib/selectOptionBuilders';\n",
        )
    if "FURO_STATUS_FILTER_OPTIONS" not in text:
        text = text.replace(
            "const ITEMS_PER_PAGE = 12;\n",
            """const ITEMS_PER_PAGE = 12;

const FURO_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'RESOLVIDO', label: 'Resolvido' },
  { value: 'ALL', label: 'Todos' },
]);

const FURO_MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      value: String(month),
      label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
    };
  }),
]);
""",
        )
    if "costCenterFilterOptions" not in text:
        text = text.replace(
            "  const costCenters =",
            """  const costCenterFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCenters.map((cc: { id: string; name: string }) => ({
        value: cc.id,
        label: cc.name,
        searchText: cc.name,
      })),
    ],
    [costCenters]
  );

  const categoryFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todas', searchText: 'Todas' },
      ...CATEGORIES.map((cat) => ({ value: cat, label: cat, searchText: cat })),
    ],
    []
  );

  const yearFilterOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    []
  );

  const costCenters =""",
        )
    reps = [
        (
            """                        <select
                          value={filtersCostCenterId}
                          onChange={(e) => setFiltersCostCenterId(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="">Todos</option>
                          {costCenters.map((cc: { id: string; code: string; name: string }) => (
                            <option key={cc.id} value={cc.id}>
                              {cc.name}
                            </option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filtersCostCenterId}
                          onChange={setFiltersCostCenterId}
                          options={costCenterFilterOptions}
                          allowEmpty={false}
                        />""",
        ),
        (
            """                        <select
                          value={filtersCategory}
                          onChange={(e) => setFiltersCategory(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="">Todas</option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filtersCategory}
                          onChange={setFiltersCategory}
                          options={categoryFilterOptions}
                          allowEmpty={false}
                        />""",
        ),
        (
            """                        <select
                          value={filtersMonth}
                          onChange={(e) => setFiltersMonth(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="">Todos</option>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
                            </option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filtersMonth}
                          onChange={setFiltersMonth}
                          options={FURO_MONTH_FILTER_OPTIONS}
                          allowEmpty={false}
                        />""",
        ),
        (
            """                        <select
                          value={filtersYear}
                          onChange={(e) => setFiltersYear(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filtersYear}
                          onChange={setFiltersYear}
                          options={yearFilterOptions}
                          allowEmpty={false}
                        />""",
        ),
        (
            """                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="ABERTO">Aberto</option>
                          <option value="RESOLVIDO">Resolvido</option>
                          <option value="ALL">Todos</option>
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={statusFilter}
                          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                          options={FURO_STATUS_FILTER_OPTIONS}
                          allowEmpty={false}
                        />""",
        ),
    ]
    for o, n in reps:
        text = text.replace(o, n)
    f.write_text(text, encoding="utf-8")
    print("furo-estoque:", text.count("<select"))


def migrate_centros_custo():
    f = ROOT / "app/ponto/centros-custo/page.tsx"
    text = f.read_text(encoding="utf-8")
    if "StringSingleSelectDropdown" not in text:
        text = text.replace(
            "import { POLOS_LIST, COMPANIES_LIST } from '@/constants/payrollFilters';\n",
            "import { POLOS_LIST, COMPANIES_LIST } from '@/constants/payrollFilters';\nimport { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';\nimport { filterOptionsWithAll, labeledToSelectOptions } from '@/lib/selectOptionBuilders';\n",
        )
    if "ACTIVE_STATUS_FILTER_OPTIONS" not in text:
        text = text.replace(
            "const ESTADOS_LIST = ['DF', 'GO'];\n",
            """const ESTADOS_LIST = ['DF', 'GO'];

const ACTIVE_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'true', label: 'Ativo' },
  { value: 'false', label: 'Inativo' },
]);

const IMPORT_ACTIVE_OPTIONS = labeledToSelectOptions([
  { value: 'Ativo', label: 'Ativo' },
  { value: 'Inativo', label: 'Inativo' },
]);
""",
        )
    if "stateFilterSelectOptions" not in text:
        text = text.replace(
            "  const [isFiltersModalOpen",
            """  const stateFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(ESTADOS_LIST, 'Todos'),
    []
  );

  const [isFiltersModalOpen""",
        )
    reps = [
        (
            """                <select
                  value={isActiveFilter}
                  onChange={(e) => setIsActiveFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="all">Todos</option>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>""",
            """                <StringSingleSelectDropdown
                  value={isActiveFilter}
                  onChange={setIsActiveFilter}
                  options={ACTIVE_STATUS_FILTER_OPTIONS}
                  allowEmpty={false}
                />""",
        ),
        (
            """                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="all">Todos</option>
                  {ESTADOS_LIST.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>""",
            """                <StringSingleSelectDropdown
                  value={stateFilter}
                  onChange={setStateFilter}
                  options={stateFilterSelectOptions}
                  allowEmpty={false}
                />""",
        ),
        (
            """              <select
                value={formData.polo}
                onChange={(e) => setFormData({ ...formData, polo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Selecione</option>
                {POLOS_LIST.map(p => <option key={p} value={p}>{p}</option>)}
              </select>""",
            """              <StringSingleSelectDropdown
                value={formData.polo}
                onChange={(polo) => setFormData({ ...formData, polo })}
                options={POLOS_LIST}
                placeholder="Selecione"
                emptyOptionLabel="Selecione"
              />""",
        ),
        (
            """                            <select
                              value={row.dados.Ativo || 'Ativo'}
                              onChange={(e) => updateRow(index, 'Ativo', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            >
                              <option value="Ativo">Ativo</option>
                              <option value="Inativo">Inativo</option>
                            </select>""",
            """                            <StringSingleSelectDropdown
                              value={row.dados.Ativo || 'Ativo'}
                              onChange={(v) => updateRow(index, 'Ativo', v)}
                              options={IMPORT_ACTIVE_OPTIONS}
                              allowEmpty={false}
                            />""",
        ),
    ]
    for o, n in reps:
        text = text.replace(o, n)
    f.write_text(text, encoding="utf-8")
    print("centros-custo:", text.count("<select"))


if __name__ == "__main__":
    migrate_furo_estoque()
    migrate_centros_custo()
