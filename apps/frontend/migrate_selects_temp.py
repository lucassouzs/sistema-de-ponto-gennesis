#!/usr/bin/env python3
"""Temporary script to finish banco-horas department select migration."""
from pathlib import Path

p = Path(__file__).parent / "src/app/ponto/banco-horas/page.tsx"
text = p.read_text(encoding="utf-8")
old = """                          <select
                            value={filters.department}
                            onChange={handleDepartmentChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os setores</option>
                            {(DEPARTMENTS_LIST || []).map(dept => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>"""
new = """                          <StringSingleSelectDropdown
                            value={filters.department ?? ''}
                            onChange={handleDepartmentChange}
                            options={DEPARTMENTS_LIST || []}
                            emptyOptionLabel="Todos os setores"
                          />"""
if old not in text:
    print("department block not found, selects:", text.count("<select"))
else:
    text = text.replace(old, new)
    p.write_text(text, encoding="utf-8")
    print("ok, remaining selects:", text.count("<select"))
