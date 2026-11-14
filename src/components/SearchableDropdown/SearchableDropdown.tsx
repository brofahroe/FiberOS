'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, ArrowUpDown } from 'lucide-react';

interface SiteOption {
  emrSiteCode: string;
  subfeederId: string;
  clusterId: string;
  clusterName: string;
  shortName: string;
  oltName: string;
}

interface SearchableDropdownProps {
  options: SiteOption[];
  value: SiteOption | null;
  onChange: (option: SiteOption | null) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchableDropdown({
  options,
  value,
  onChange,
  label = 'Pilih Cluster',
  required = false,
  placeholder = 'Ketik untuk mencari...',
  disabled,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedOption, setSelectedOption] = useState<SiteOption | null>(value || null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedOption(value || null);
  }, [value]);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const normalizedQuery = query.toLowerCase().trim();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options.slice(0, 50);

    const scored = options.map((opt) => {
      let score = 0;
      const searchableFields = [
        opt.clusterName,
        opt.shortName,
        opt.clusterId,
        opt.subfeederId,
        opt.emrSiteCode,
        opt.oltName,
      ];

      searchableFields.forEach((field) => {
        const lowerField = field.toLowerCase();
        if (lowerField === normalizedQuery) score += 100;
        else if (lowerField.startsWith(normalizedQuery)) score += 50;
        else if (lowerField.includes(normalizedQuery)) score += 10;
      });

      return { option: opt, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.option)
      .slice(0, 100);
  }, [options, normalizedQuery]);

  const handleSelect = (opt: SiteOption) => {
    setSelectedOption(opt);
    setQuery(opt.clusterName);
    setIsOpen(false);
    setSelectedIndex(-1);
    onChange(opt);
    inputRef.current?.blur();
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOption(null);
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
    onChange(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setSelectedIndex(-1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && filteredOptions[selectedIndex]) {
        handleSelect(filteredOptions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  return (
    <div ref={dropdownRef} className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        <div className="absolute left-3 top-3 text-slate-400 w-4 h-4 pointer-events-none">
          <Search />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={selectedOption ? selectedOption.clusterName : query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 150);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3.5 py-2.5 pl-10 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
        />

        {selectedOption && !disabled && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition"
            aria-label="Hapus pilihan"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {isOpen && !disabled && (
          <div
            className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-100"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">
                Tidak ditemukan. Coba ketik huruf pertama dari nama cluster.
              </div>
            ) : (
              <div>
                {query.trim() === '' ? (
                  <div className="px-3 py-2 text-xs text-slate-400 font-medium uppercase tracking-wider">
                    Pilih cluster dari daftar
                  </div>
                ) : null}
                {filteredOptions.map((opt, idx) => {
                  const isHighlighted = idx === selectedIndex;
                  const isSelected =
                    selectedOption &&
                    opt.clusterId === selectedOption.clusterId;

                  return (
                    <button
                      key={opt.clusterId}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition ${isHighlighted ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'} ${isSelected ? 'bg-emerald-50 text-emerald-700 font-semibold' : ''}`}
                    >
                      <div className="flex-1 truncate">
                        <div className="font-medium">{opt.clusterName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {opt.shortName} • {opt.clusterId} • {opt.oltName}
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="text-emerald-600 text-xs font-bold">✓ Dipilih</span>
                      ) : null}
                    </button>
                  );
                })}
                {query.trim() !== '' && filteredOptions.length > 0 && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <ArrowUpDown className="w-3 h-3" />
                      <span>Tekan Enter untuk pilih</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {required && !selectedOption && (
        <p className="mt-1 text-[11px] text-rose-600">Cluster wajib dipilih.</p>
      )}
    </div>
  );
}

