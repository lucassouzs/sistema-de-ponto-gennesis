import React, { useState, useEffect } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Digite para buscar...",
  className = "",
  label,
  error,
  disabled = false
}: SearchableSelectProps) {
  const [searchValue, setSearchValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Filtrar opções baseado na busca
  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Função para selecionar uma opção
  const selectOption = (option: string) => {
    onChange(option);
    setSearchValue(option);
    setShowDropdown(false);
  };

  // Sincronizar searchValue com value quando value muda externamente
  useEffect(() => {
    if (value !== searchValue) {
      setSearchValue(value);
    }
  }, [value]);

  // Limpar busca quando campo está vazio
  useEffect(() => {
    if (searchValue === '') {
      onChange('');
    }
  }, [searchValue, onChange]);

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <input
        type="text"
        value={searchValue}
        onChange={(e) => {
          setSearchValue(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-300' : 'border-gray-300'
        } ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} ${className}`}
      />
      
      {/* Dropdown com resultados */}
      {showDropdown && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option}
                onClick={() => selectOption(option)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                {option}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">
              Nenhum item encontrado
            </div>
          )}
        </div>
      )}
      
      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
    </div>
  );
}
