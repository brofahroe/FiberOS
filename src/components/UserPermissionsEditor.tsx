'use client';

import { useState } from 'react';
import {
  ALL_CITIES_TOKEN,
  PERMISSION_PRESETS,
  type DailyInputEditScope,
  type PermissionPresetKey,
  type UserPermissions,
  type UserRole,
} from '@/lib/permissions';
import { MapPin, Plus, Shield, Sparkles } from 'lucide-react';

export default function UserPermissionsEditor({
  role,
  permissions,
  allowedCities,
  availableCities,
  onChangePermissions,
  onChangeAllowedCities,
}: {
  role: UserRole;
  permissions: UserPermissions;
  allowedCities: string[];
  availableCities: string[];
  onChangePermissions: (next: UserPermissions) => void;
  onChangeAllowedCities: (next: string[]) => void;
}) {
  const [customCityInput, setCustomCityInput] = useState('');

  if (role === 'ADMIN') {
    return (
      <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-2.5">
        <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <strong className="block">Role ADMIN memiliki akses penuh otomatis</strong>
          <span className="text-indigo-700">
            Admin dapat mengakses seluruh fitur (termasuk Manajemen User, Impor BOQ, Edit BOQ, Kelola Sitelist) dan semua Kota tanpa pembatasan.
          </span>
        </div>
      </div>
    );
  }

  const allCitiesSelected = allowedCities.some(
    (c) => c.trim().toUpperCase() === ALL_CITIES_TOKEN
  );

  const cityChoices = Array.from(
    new Set([
      ...availableCities,
      ...allowedCities.filter((c) => c.trim().toUpperCase() !== ALL_CITIES_TOKEN),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const applyPreset = (presetKey: PermissionPresetKey) => {
    onChangePermissions({ ...PERMISSION_PRESETS[presetKey].permissions });
  };

  const toggleBool = (key: keyof Omit<UserPermissions, 'dailyInputEditScope'>) => {
    const nextVal = !permissions[key];
    const next: UserPermissions = { ...permissions, [key]: nextVal };

    // Keep View/Edit dependencies consistent
    if (key === 'matrixExport' && nextVal) next.matrixView = true;
    if (key === 'matrixEditStatus' && nextVal) next.matrixView = true;
    if (key === 'matrixView' && !nextVal) {
      next.matrixExport = false;
      next.matrixEditStatus = false;
    }

    if (key === 'sitelistManage' && nextVal) next.sitelistView = true;
    if (key === 'sitelistView' && !nextVal) next.sitelistManage = false;

    if (key === 'clustersEdit' && nextVal) next.clustersView = true;
    if (key === 'clustersView' && !nextVal) next.clustersEdit = false;

    onChangePermissions(next);
  };

  const handleToggleAllCities = () => {
    if (allCitiesSelected) {
      onChangeAllowedCities([cityChoices[0] || 'Blora']);
    } else {
      onChangeAllowedCities([ALL_CITIES_TOKEN]);
    }
  };

  const handleToggleCity = (city: string) => {
    const lower = city.toLowerCase();
    const base = allCitiesSelected ? [] : allowedCities;
    const exists = base.some((c) => c.toLowerCase() === lower);
    if (exists) {
      const next = base.filter((c) => c.toLowerCase() !== lower);
      if (next.length === 0) return; // keep at least 1 city
      onChangeAllowedCities(next);
    } else {
      onChangeAllowedCities([...base, city]);
    }
  };

  const handleAddCustomCity = () => {
    const trimmed = customCityInput.trim();
    if (!trimmed) return;
    const base = allCitiesSelected ? [] : allowedCities;
    if (!base.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      onChangeAllowedCities([...base, trimmed]);
    }
    setCustomCityInput('');
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Preset Bar */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Preset Cepat Wewenang:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(PERMISSION_PRESETS) as PermissionPresetKey[]).map((key) => {
            const preset = PERMISSION_PRESETS[key];
            const isMatch =
              JSON.stringify(permissions) === JSON.stringify(preset.permissions);
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`p-2.5 rounded-xl border text-left transition ${
                  isMatch
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30 text-blue-950'
                    : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span className="font-bold block">{preset.label}</span>
                <span className="text-[10px] text-slate-500 leading-snug block mt-0.5">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Granular View vs Edit Checkboxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Dashboard */}
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1.5">
            Dashboard
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.dashboardView}
              onChange={() => toggleBool('dashboardView')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Lihat Dashboard &amp; Ringkasan</span>
          </label>
        </div>

        {/* Input Harian */}
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1.5">
            Input Harian
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.dailyInputView}
              onChange={() => toggleBool('dailyInputView')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Lihat Form &amp; Riwayat Input</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.dailyInputCreate}
              onChange={() => toggleBool('dailyInputCreate')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Tambah Input Harian Baru</span>
          </label>
          <div className="pt-1">
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">
              Edit / Hapus Riwayat Harian:
            </span>
            <select
              value={permissions.dailyInputEditScope}
              onChange={(e) =>
                onChangePermissions({
                  ...permissions,
                  dailyInputEditScope: e.target.value as DailyInputEditScope,
                })
              }
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="NONE">Tidak Bisa Edit / Hapus</option>
              <option value="OWN">Hanya Laporan Milik Sendiri</option>
              <option value="ALL">Semua Laporan</option>
            </select>
          </div>
        </div>

        {/* Matriks & Ekspor */}
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1.5">
            Matriks &amp; Ekspor
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.matrixView}
              onChange={() => toggleBool('matrixView')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Lihat Tabel Matriks</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.matrixExport}
              onChange={() => toggleBool('matrixExport')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Ekspor Excel &amp; Format WA</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.matrixEditStatus}
              onChange={() => toggleBool('matrixEditStatus')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Ubah Status Final (DONE/HOLD)</span>
          </label>
        </div>

        {/* Sitelist */}
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1.5">
            Sitelist
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.sitelistView}
              onChange={() => toggleBool('sitelistView')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Lihat Sitelist &amp; Summary</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.sitelistManage}
              onChange={() => toggleBool('sitelistManage')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Kelola Sitelist (Tambah/Edit/Impor/Aktifkan)</span>
          </label>
        </div>

        {/* Cluster & BOQ */}
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1.5">
            Cluster &amp; BOQ
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.clustersView}
              onChange={() => toggleBool('clustersView')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Lihat Cluster &amp; Rincian BOQ</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.clustersEdit}
              onChange={() => toggleBool('clustersEdit')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Edit Target BOQ &amp; Tambah/Hapus Item</span>
          </label>
        </div>

        {/* Impor BOQ */}
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1.5">
            Impor BOQ Excel
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={permissions.importBoq}
              onChange={() => toggleBool('importBoq')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Impor / Timpa Master BOQ Excel</span>
          </label>
        </div>
      </div>

      {/* Kota Scope Selector */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            <span>Akses Wilayah (Kota):</span>
          </div>
          <label className="inline-flex items-center gap-1.5 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={allCitiesSelected}
              onChange={handleToggleAllCities}
              className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Semua Kota</span>
          </label>
        </div>

        {!allCitiesSelected && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {cityChoices.map((city) => {
                const checked = allowedCities.some(
                  (c) => c.toLowerCase() === city.toLowerCase()
                );
                return (
                  <label
                    key={city}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer transition ${
                      checked
                        ? 'bg-blue-50 border-blue-400 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleCity(city)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Kota {city}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center gap-2 max-w-xs">
              <input
                type="text"
                value={customCityInput}
                onChange={(e) => setCustomCityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCity();
                  }
                }}
                placeholder="Tambah Kota baru (misal: Semarang)..."
                className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCustomCity}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[11px] font-bold transition"
              >
                <Plus className="w-3 h-3" />
                <span>Tambah</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
