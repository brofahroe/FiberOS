'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Users, X, Clock, CheckCircle2 } from 'lucide-react';
import type { TimPelaksanaOption } from '@/lib/timPelaksana';

export interface PreviousTeamOption {
  teamName: string;
  lastDate: string;
}

interface TeamSelectorDropdownProps {
  value: string;
  onChange: (value: string) => void;
  teamsOnDate: string[];
  previousTeams: PreviousTeamOption[];
  masterTeams: TimPelaksanaOption[];
  loadingTeams?: boolean;
  error?: string | null;
}

export function TeamSelectorDropdown({
  value,
  onChange,
  teamsOnDate,
  previousTeams,
  masterTeams,
  loadingTeams = false,
  error = null,
}: TeamSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchFilter('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasClusterHistory = teamsOnDate.length > 0 || previousTeams.length > 0;
  const query = searchFilter.trim().toLowerCase();

  const filteredOnDate = useMemo(() => {
    if (!query) return teamsOnDate;
    return teamsOnDate.filter((t) => t.toLowerCase().includes(query));
  }, [teamsOnDate, query]);

  const filteredPrevious = useMemo(() => {
    if (!query) return previousTeams;
    return previousTeams.filter((t) => t.teamName.toLowerCase().includes(query));
  }, [previousTeams, query]);

  const filteredMaster = useMemo(() => {
    if (!query) return masterTeams;
    return masterTeams.filter(
      (t) =>
        t.tim.toLowerCase().includes(query) ||
        t.timPelaksana.toLowerCase().includes(query) ||
        t.subcon.toLowerCase().includes(query)
    );
  }, [masterTeams, query]);

  const handleSelect = (selectedName: string) => {
    onChange(selectedName);
    setSearchFilter('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    setSearchFilter('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const placeholder = hasClusterHistory
    ? 'Pilih tim sebelumnya atau dari daftar...'
    : 'Pilih tim dari TimPelaksana.xlsx...';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSearchFilter(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setSearchFilter('');
            setIsOpen(true);
          }}
          onClick={() => {
            setSearchFilter('');
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              setSearchFilter('');
            }
          }}
          placeholder={placeholder}
          required
          autoComplete="off"
          className="w-full px-3.5 py-2.5 pr-16 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onMouseDown={handleClear}
              className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition"
              title="Kosongkan tim"
              aria-label="Kosongkan tim"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setSearchFilter('');
              setIsOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg transition"
            title="Buka pilihan tim"
            aria-label="Buka pilihan tim"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
          {(filteredOnDate.length > 0 || filteredPrevious.length > 0) && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Tim Sebelumnya di Cluster Ini</span>
              </div>

              {filteredOnDate.map((t) => {
                const isSelected = value.trim() === t;
                return (
                  <button
                    key={`date-${t}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(t);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{t}</span>
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                      Di tgl ini
                    </span>
                  </button>
                );
              })}

              {filteredPrevious.map((item) => {
                const isSelected = value.trim() === item.teamName;
                return (
                  <button
                    key={`prev-${item.teamName}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(item.teamName);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{item.teamName}</span>
                    </span>
                    {item.lastDate && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">
                        {item.lastDate}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filteredMaster.length > 0 && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>Daftar Tim (TimPelaksana.xlsx)</span>
              </div>

              {filteredMaster.map((mt) => {
                const isSelected = value.trim() === mt.tim;
                return (
                  <button
                    key={`master-${mt.tim}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(mt.tim);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="truncate">{mt.tim}</span>
                    {mt.subcon && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">
                        {mt.subcon}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filteredOnDate.length === 0 &&
            filteredPrevious.length === 0 &&
            filteredMaster.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-500">
                Tidak ada tim yang cocok dengan &ldquo;{searchFilter}&rdquo;. Tekan kirim untuk memakai nama tim manual.
              </div>
            )}
        </div>
      )}

      {/* Quick Chips: Tim di tanggal ini */}
      {teamsOnDate.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Tim di tanggal ini:</span>
          {teamsOnDate.map((t) => (
            <button
              key={`chip-date-${t}`}
              type="button"
              onClick={() => setTeamQuickPick(t)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition ${
                value.trim() === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Quick Chips: Tim hari sebelumnya di cluster ini */}
      {previousTeams.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Tim sebelumnya:</span>
          {previousTeams.map((item) => (
            <button
              key={`chip-prev-${item.teamName}`}
              type="button"
              onClick={() => setTeamQuickPick(item.teamName)}
              title={item.lastDate ? `Terakhir bekerja: ${item.lastDate}` : undefined}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition inline-flex items-center gap-1 ${
                value.trim() === item.teamName
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              <span>{item.teamName}</span>
              {item.lastDate && (
                <span
                  className={`text-[10px] ${
                    value.trim() === item.teamName ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  ({item.lastDate})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!hasClusterHistory && !loadingTeams && !error && (
        <p className="mt-1 text-[11px] text-slate-500">
          Cluster baru — pilih tim dari dropdown TimPelaksana.xlsx di atas.
        </p>
      )}

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );

  function setTeamQuickPick(name: string) {
    onChange(name);
    setSearchFilter('');
    setIsOpen(false);
  }
}
