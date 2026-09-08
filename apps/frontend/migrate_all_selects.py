#!/usr/bin/env python3
"""Migrate native <select> to StringSingleSelectDropdown in target files."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).parent / "src"

IMPORT_SSD = "import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';"
IMPORT_BUILDERS = "import { labeledToSelectOptions, filterOptionsWithAll } from '@/lib/selectOptionBuilders';"
IMPORT_MULTI = "import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';"
IMPORT_STRINGS = "import { stringsToSelectOptions } from '@/lib/selectOptionBuilders';"


def ensure_imports(text: str, *imports: str) -> str:
    for imp in imports:
        if imp not in text:
            # insert after last import line
            lines = text.splitlines()
            last_import = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    last_import = i
            lines.insert(last_import + 1, imp)
            text = "\n".join(lines)
    return text


def count_selects(text: str) -> int:
    return len(re.findall(r"<select\b", text))


def apply(file_rel: str, transforms: list[tuple[str, str]], imports: tuple[str, ...] = ()) -> None:
    path = ROOT / file_rel
    text = path.read_text(encoding="utf-8")
    before = count_selects(text)
    for old, new in transforms:
        if old not in text:
            print(f"  WARN missing block in {file_rel}")
        else:
            text = text.replace(old, new)
    if imports:
        text = ensure_imports(text, *imports)
    after = count_selects(text)
    path.write_text(text, encoding="utf-8")
    print(f"{file_rel}: {before} -> {after} selects")


def migrate_gerenciar_solicitacoes() -> None:
    f = "app/ponto/gerenciar-solicitacoes/page.tsx"
    path = ROOT / f
    text = path.read_text(encoding="utf-8")
    text = ensure_imports(text, IMPORT_SSD, IMPORT_BUILDERS)
    text = text.replace(
        "  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, month: parseInt(e.target.value) });\n  };",
        "  const handleMonthChange = (value: string) => {\n    setFilters({ ...filters, month: parseInt(value) });\n  };",
    )
    text = text.replace(
        "  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, year: parseInt(e.target.value) });\n  };",
        "  const handleYearChange = (value: string) => {\n    setFilters({ ...filters, year: parseInt(value) });\n  };",
    )
    text = text.replace(
        "  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, department: e.target.value });\n  };",
        "  const handleDepartmentChange = (value: string) => {\n    setFilters({ ...filters, department: value });\n  };",
    )
    text = text.replace(
        "  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, position: e.target.value });\n  };",
        "  const handlePositionChange = (value: string) => {\n    setFilters({ ...filters, position: value });\n  };",
    )
    text = text.replace(
        "  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, company: e.target.value });\n  };",
        "  const handleCompanyChange = (value: string) => {\n    setFilters({ ...filters, company: value });\n  };",
    )
    anchor = "  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);"
    extra = """
  const monthFilterSelectOptions = useMemo(
    () => monthOptions.map((m) => ({ value: String(m.value), label: m.label })),
    []
  );
  const yearFilterSelectOptions = useMemo(
    () => yearOptions.map((y) => ({ value: String(y), label: String(y) })),
    [yearOptions]
  );"""
    if "monthFilterSelectOptions" not in text:
        text = text.replace(anchor, anchor + extra)
        text = text.replace(
            "import React, { useState } from 'react';",
            "import React, { useMemo, useState } from 'react';",
        )
    replacements = [
        (
            """                        <select
                          value={filters.department}
                          onChange={handleDepartmentChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                            <option value="">Todos os setores</option>
                          {DEPARTMENTS_LIST.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filters.department}
                          onChange={handleDepartmentChange}
                          options={DEPARTMENTS_LIST}
                          emptyOptionLabel="Todos os setores"
                        />""",
        ),
        (
            """                        <select
                          value={filters.position}
                          onChange={handlePositionChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todos os cargos</option>
                          {CARGOS_LIST.map(cargo => (
                            <option key={cargo} value={cargo}>{cargo}</option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filters.position}
                          onChange={handlePositionChange}
                          options={CARGOS_LIST}
                          emptyOptionLabel="Todos os cargos"
                        />""",
        ),
        (
            """                        <select
                          value={filters.company}
                          onChange={handleCompanyChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todas as empresas</option>
                          {COMPANIES_LIST.map(company => (
                            <option key={company} value={company}>{company}</option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filters.company}
                          onChange={handleCompanyChange}
                          options={COMPANIES_LIST}
                          emptyOptionLabel="Todas as empresas"
                        />""",
        ),
        (
            """                          <select
                            value={filters.month}
                            onChange={handleMonthChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            {monthOptions.map(month => (
                              <option key={month.value} value={month.value}>
                                {month.label}
                              </option>
                            ))}
                          </select>""",
            """                          <StringSingleSelectDropdown
                            value={String(filters.month)}
                            onChange={handleMonthChange}
                            options={monthFilterSelectOptions}
                            allowEmpty={false}
                          />""",
        ),
        (
            """                          <select
                            value={filters.year}
                            onChange={handleYearChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            {yearOptions.map(year => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>""",
            """                          <StringSingleSelectDropdown
                            value={String(filters.year)}
                            onChange={handleYearChange}
                            options={yearFilterSelectOptions}
                            allowEmpty={false}
                          />""",
        ),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")
    print(f"{f}: -> {count_selects(text)} selects")


def migrate_gerenciar_atestados() -> None:
    f = "app/ponto/gerenciar-atestados/page.tsx"
    path = ROOT / f
    text = path.read_text(encoding="utf-8")
    text = ensure_imports(text, IMPORT_SSD, IMPORT_BUILDERS)
    text = text.replace("import React, { useState } from 'react';", "import React, { useMemo, useState } from 'react';")
    if "CERTIFICATE_TYPE_FILTER_OPTIONS" not in text:
        text = text.replace(
            "import { CARGOS_LIST } from '@/constants/cargos';\n",
            "import { CARGOS_LIST } from '@/constants/cargos';\n\nconst CERTIFICATE_TYPE_FILTER_OPTIONS = labeledToSelectOptions([\n  { value: 'all', label: 'Todos' },\n  { value: 'MEDICAL', label: 'Atestado Médico' },\n  { value: 'DENTAL', label: 'Atestado Odontológico' },\n  { value: 'PREVENTIVE', label: 'Exame Preventivo' },\n  { value: 'ACCIDENT', label: 'Acidente de Trabalho' },\n  { value: 'COVID', label: 'COVID-19' },\n  { value: 'MATERNITY', label: 'Maternidade' },\n  { value: 'PATERNITY', label: 'Paternidade' },\n  { value: 'OTHER', label: 'Outros' },\n]);\n",
        )
    for old, new in [
        ("  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, type: e.target.value });\n  };", "  const handleTypeChange = (value: string) => {\n    setFilters({ ...filters, type: value });\n  };"),
        ("  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, month: parseInt(e.target.value) });\n  };", "  const handleMonthChange = (value: string) => {\n    setFilters({ ...filters, month: parseInt(value) });\n  };"),
        ("  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, year: parseInt(e.target.value) });\n  };", "  const handleYearChange = (value: string) => {\n    setFilters({ ...filters, year: parseInt(value) });\n  };"),
        ("  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, department: e.target.value });\n  };", "  const handleDepartmentChange = (value: string) => {\n    setFilters({ ...filters, department: value });\n  };"),
        ("  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, position: e.target.value });\n  };", "  const handlePositionChange = (value: string) => {\n    setFilters({ ...filters, position: value });\n  };"),
        ("  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {\n    setFilters({ ...filters, company: e.target.value });\n  };", "  const handleCompanyChange = (value: string) => {\n    setFilters({ ...filters, company: value });\n  };"),
    ]:
        text = text.replace(old, new)
    anchor = "  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);"
    if "monthFilterSelectOptions" not in text:
        text = text.replace(
            anchor,
            anchor
            + """
  const monthFilterSelectOptions = useMemo(
    () => [
      { value: '0', label: 'Todos os meses', searchText: 'Todos os meses' },
      ...monthOptions.map((m) => ({ value: String(m.value), label: m.label })),
    ],
    []
  );
  const yearFilterSelectOptions = useMemo(
    () => [
      { value: '0', label: 'Todos os anos', searchText: 'Todos os anos' },
      ...yearOptions.map((y) => ({ value: String(y), label: String(y) })),
    ],
    [yearOptions]
  );""",
        )
    replacements = [
        (
            """                        <select
                          value={filters.type}
                          onChange={handleTypeChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="all">Todos</option>
                          <option value="MEDICAL">Atestado Médico</option>
                          <option value="DENTAL">Atestado Odontológico</option>
                          <option value="PREVENTIVE">Exame Preventivo</option>
                          <option value="ACCIDENT">Acidente de Trabalho</option>
                          <option value="COVID">COVID-19</option>
                          <option value="MATERNITY">Maternidade</option>
                          <option value="PATERNITY">Paternidade</option>
                          <option value="OTHER">Outros</option>
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filters.type}
                          onChange={handleTypeChange}
                          options={CERTIFICATE_TYPE_FILTER_OPTIONS}
                          allowEmpty={false}
                        />""",
        ),
        (
            """                          <select
                            value={filters.department}
                            onChange={handleDepartmentChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os setores</option>
                            {DEPARTMENTS_LIST.map(dept => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>""",
            """                          <StringSingleSelectDropdown
                            value={filters.department}
                            onChange={handleDepartmentChange}
                            options={DEPARTMENTS_LIST}
                            emptyOptionLabel="Todos os setores"
                          />""",
        ),
        (
            """                        <select
                          value={filters.position}
                          onChange={handlePositionChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todos os cargos</option>
                          {CARGOS_LIST.map(cargo => (
                            <option key={cargo} value={cargo}>
                              {cargo}
                            </option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filters.position}
                          onChange={handlePositionChange}
                          options={CARGOS_LIST}
                          emptyOptionLabel="Todos os cargos"
                        />""",
        ),
        (
            """                        <select
                          value={filters.company}
                          onChange={handleCompanyChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todas as empresas</option>
                          {COMPANIES_LIST.map(company => (
                            <option key={company} value={company}>
                              {company}
                            </option>
                          ))}
                        </select>""",
            """                        <StringSingleSelectDropdown
                          value={filters.company}
                          onChange={handleCompanyChange}
                          options={COMPANIES_LIST}
                          emptyOptionLabel="Todas as empresas"
                        />""",
        ),
        (
            """                          <select
                            value={filters.month}
                            onChange={handleMonthChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value={0}>Todos os meses</option>
                            {monthOptions.map(month => (
                              <option key={month.value} value={month.value}>
                                {month.label}
                              </option>
                            ))}
                          </select>""",
            """                          <StringSingleSelectDropdown
                            value={String(filters.month)}
                            onChange={handleMonthChange}
                            options={monthFilterSelectOptions}
                            allowEmpty={false}
                          />""",
        ),
        (
            """                          <select
                            value={filters.year}
                            onChange={handleYearChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value={0}>Todos os anos</option>
                            {yearOptions.map(year => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>""",
            """                          <StringSingleSelectDropdown
                            value={String(filters.year)}
                            onChange={handleYearChange}
                            options={yearFilterSelectOptions}
                            allowEmpty={false}
                          />""",
        ),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")
    print(f"{f}: -> {count_selects(text)} selects")


def main() -> None:
    migrate_gerenciar_solicitacoes()
    migrate_gerenciar_atestados()
    print("partial done")


if __name__ == "__main__":
    main()
