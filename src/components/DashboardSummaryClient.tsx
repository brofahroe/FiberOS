'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ProjectSummary, CategoryProgress, ClusterWithProgress } from '@/types';
import {
  Layers,
  TrendingUp,
  ArrowRight,
  HardHat,
  Cable,
  Box,
  Cpu,
  MapPin,
  Filter,
  PlusCircle,
} from 'lucide-react';

function summarizeScopePoleCable(cluster: ClusterWithProgress) {
  const sumBy = (
    targetScope: 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER',
    targetCategory: 'POLE' | 'CABLE'
  ) => {
    let boq = 0;
    let installed = 0;
    for (const it of cluster.workItems) {
      const itemScope = it.scope || 'CLUSTER';
      const matchesScope =
        targetScope === 'MAIN_FEEDER'
          ? itemScope === 'MAIN_FEEDER' || itemScope === 'SUBFEEDER'
          : itemScope === targetScope;
      if (!matchesScope) continue;

      const cat = (it.category || '').toUpperCase();
      const sub = (it.subCategory || '').toUpperCase();
      const matchesCategory = cat === targetCategory || sub === targetCategory;
      if (!matchesCategory) continue;

      boq += it.boq;
      installed += it.status === 'DONE' ? Math.max(it.installed, it.boq) : it.installed;
    }
    return {
      boq: Math.round(boq * 10) / 10,
      installed: Math.round(installed * 10) / 10,
    };
  };

  return {
    clrPole: sumBy('CLUSTER', 'POLE'),
    clrCable: sumBy('CLUSTER', 'CABLE'),
    sfPole: sumBy('SUBFEEDER', 'POLE'),
    sfCable: sumBy('SUBFEEDER', 'CABLE'),
    mfPole: sumBy('MAIN_FEEDER', 'POLE'),
    mfCable: sumBy('MAIN_FEEDER', 'CABLE'),
  };
}

function formatCardStat(value: number): string {
  return value.toLocaleString('en-US');
}

export default function DashboardSummaryClient({
  project,
  clusters,
}: {
  project: ProjectSummary;
  categories: CategoryProgress[];
  clusters: ClusterWithProgress[];
}) {
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('ALL');
  const [selectedKecamatan, setSelectedKecamatan] = useState<string>('ALL');

  const kabupatenOptions = useMemo(() => {
    const set = new Set<string>(['Blora']);
    clusters.forEach((c) => {
      if (c.kabupaten) set.add(c.kabupaten);
    });
    return Array.from(set).sort();
  }, [clusters]);

  const kecamatanOptions = useMemo(() => {
    const set = new Set<string>(['Kedungtuban', 'Cepu']);
    clusters.forEach((c) => {
      if (c.kecamatan) set.add(c.kecamatan);
    });
    return Array.from(set).sort();
  }, [clusters]);

  const filteredClusters = useMemo(() => {
    return clusters.filter((c) => {
      const kab = c.kabupaten || 'Blora';
      const kec = c.kecamatan || 'Kedungtuban';
      if (selectedKabupaten !== 'ALL' && kab !== selectedKabupaten) return false;
      if (selectedKecamatan !== 'ALL' && kec !== selectedKecamatan) return false;
      return true;
    });
  }, [clusters, selectedKabupaten, selectedKecamatan]);

  // Recalculate KPI and Category metrics for filtered clusters
  const dynamicStats = useMemo(() => {
    const totalClusters = filteredClusters.length;
    const overallProgress =
      totalClusters > 0
        ? Math.round(filteredClusters.reduce((s, c) => s + c.percentage, 0) / totalClusters)
        : 0;

    const catDefs = [
      { key: 'POLE', displayName: 'Tiang (Poles)', unit: 'Btg', icon: HardHat },
      { key: 'CABLE', displayName: 'Penarikan Kabel', unit: 'Meter', icon: Cable },
      { key: 'FAT', displayName: 'Terminasi FAT', unit: 'Pcs', icon: Box },
      { key: 'FDT', displayName: 'Terminasi FDT', unit: 'Pcs', icon: Cpu },
    ];

    const computedCategories = catDefs.map((def) => {
      let boq = 0;
      let installed = 0;
      for (const c of filteredClusters) {
        for (const it of c.workItems) {
          if (it.category === def.key) {
            boq += it.boq;
            const effectiveInstalled =
              it.status === 'DONE' ? Math.max(it.installed, it.boq) : it.installed;
            installed += effectiveInstalled;
          }
        }
      }
      const pct = boq > 0 ? Math.min(100, Math.round((installed / boq) * 100)) : 0;
      return {
        ...def,
        boq: Math.round(boq * 10) / 10,
        installed: Math.round(installed * 10) / 10,
        percentage: pct,
      };
    });

    const poleCategory = computedCategories.find((c) => c.key === 'POLE');
    const cableCategory = computedCategories.find((c) => c.key === 'CABLE');

    return {
      totalClusters,
      overallProgress,
      computedCategories,
      totalPoleInstalled: poleCategory?.installed ?? 0,
      totalPoleBoq: poleCategory?.boq ?? 0,
      polePercentage: poleCategory?.percentage ?? 0,
      totalCableInstalled: cableCategory?.installed ?? 0,
      totalCableBoq: cableCategory?.boq ?? 0,
      cablePercentage: cableCategory?.percentage ?? 0,
    };
  }, [filteredClusters]);

  const activeRegionText =
    selectedKecamatan !== 'ALL'
      ? `Kecamatan ${selectedKecamatan} (${selectedKabupaten !== 'ALL' ? `Kab. ${selectedKabupaten}` : 'Kab. Blora'})`
      : selectedKabupaten !== 'ALL'
      ? `Kabupaten ${selectedKabupaten}`
      : `${project.name} (Semua Wilayah)`;

  return (
    <div className="space-y-8">
      {/* Filter Summary Wilayah (Per Kecamatan / Kabupaten) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                Filter Summary Wilayah: {activeRegionText}
              </h2>
              {(selectedKecamatan !== 'ALL' || selectedKabupaten !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKabupaten('ALL');
                    setSelectedKecamatan('ALL');
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline"
                >
                  Reset Filter
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Pilih ringkasan progres berdasarkan Kabupaten atau Kecamatan, atau kelola daftar lengkap di menu Sitelist.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-600">Kabupaten:</span>
            <select
              value={selectedKabupaten}
              onChange={(e) => setSelectedKabupaten(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Kabupaten</option>
              {kabupatenOptions.map((kab) => (
                <option key={kab} value={kab}>
                  Kab. {kab}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600">Kecamatan:</span>
            <select
              value={selectedKecamatan}
              onChange={(e) => setSelectedKecamatan(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Kecamatan</option>
              {kecamatanOptions.map((kec) => (
                <option key={kec} value={kec}>
                  Kec. {kec}
                </option>
              ))}
            </select>
          </div>

          <Link
            href="/sitelist"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Menu Sitelist & Tambah Cluster</span>
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Progress</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {dynamicStats.overallProgress}%
            </span>
            <span className="text-xs text-slate-500">
              {selectedKecamatan !== 'ALL' ? `Kec. ${selectedKecamatan}` : 'keseluruhan'}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${dynamicStats.overallProgress}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Pole</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-3xl font-extrabold text-slate-900">
              {Math.round(dynamicStats.totalPoleInstalled).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">
              / {Math.round(dynamicStats.totalPoleBoq).toLocaleString()} Btg
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Tiang terpasang vs BOQ ({dynamicStats.polePercentage}%)
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Cluster Aktif</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {dynamicStats.totalClusters}
            </span>
            <span className="text-xs text-slate-500">area cluster</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {selectedKecamatan !== 'ALL'
              ? `Wilayah Kec. ${selectedKecamatan}`
              : selectedKabupaten !== 'ALL'
              ? `Wilayah Kab. ${selectedKabupaten}`
              : 'Kedungtuban, Cepu & sekitarnya'}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Panjang Kabel</span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Cable className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-3xl font-extrabold text-slate-900">
              {Math.round(dynamicStats.totalCableInstalled).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">
              / {Math.round(dynamicStats.totalCableBoq).toLocaleString()} m
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Kabel terpasang vs BOQ ({dynamicStats.cablePercentage}%)
          </p>
        </div>
      </div>

      {/* Progress Breakdown by Category */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Realisasi per Kategori Pekerjaan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Akumulasi progres instalasi terhadap target BOQ ({activeRegionText})
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {dynamicStats.computedCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.key}
                className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-slate-800">{cat.displayName}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{cat.percentage}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Terpasang: <strong className="text-slate-700">{cat.installed.toLocaleString()}</strong> {cat.unit}
                  </span>
                  <span>
                    BOQ: {cat.boq.toLocaleString()} {cat.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cluster Progress Overview Cards */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Progress Monitoring per Cluster ({filteredClusters.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar cluster aktif pada {activeRegionText}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sitelist"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
            >
              + Tambah dari Sitelist
            </Link>
            <Link
              href="/matrix"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Lihat Tabel Lengkap <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {filteredClusters.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
            <p className="text-sm font-semibold text-slate-600">
              Belum ada cluster yang diaktifkan untuk wilayah {activeRegionText}.
            </p>
            <Link
              href="/sitelist"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Buka Menu Sitelist untuk Mengaktifkan Cluster</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClusters.map((cluster) => (
              <div
                key={cluster.id}
                className="min-w-0 overflow-hidden border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition bg-white"
              >
                <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <h3
                        className={`font-bold text-slate-900 min-w-0 max-w-full break-all leading-snug ${
                          cluster.name.length > 24 ? 'text-sm' : 'text-base'
                        }`}
                        title={cluster.name}
                      >
                        {cluster.name}
                      </h3>
                      {cluster.projectType === 'MAIN_FEEDER' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0">
                          Main Feeder (100%)
                        </span>
                      )}
                      {cluster.kecamatan && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 shrink-0">
                          Kec. {cluster.kecamatan}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      Home Passes:{' '}
                      <span className="font-semibold text-slate-700">
                        {cluster.homePasses || '-'}
                      </span>
                      {cluster.oltName ? ` • ${cluster.oltName}` : ''}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0 whitespace-nowrap ${
                      cluster.percentage >= 100
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : cluster.percentage > 0
                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {cluster.percentage}% Total
                  </span>
                </div>

                {/* Overall Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2 my-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      cluster.percentage >= 100
                        ? 'bg-emerald-500'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                    }`}
                    style={{ width: `${cluster.percentage}%` }}
                  />
                </div>

                {/* Scope Breakdown Bars: Main Feeder (100%) OR CLR (70%) vs SF (30%) */}
                <div className="space-y-1.5 my-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {cluster.projectType === 'MAIN_FEEDER' ? (
                    <div>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="font-semibold text-slate-700 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block"></span>
                          Main Feeder (100%):
                        </span>
                        <span className="font-bold text-indigo-700">
                          {cluster.sfPercentage ?? cluster.percentage}%{' '}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({cluster.sfContribution ?? cluster.percentage}%)
                          </span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-indigo-600 transition-all duration-300"
                          style={{ width: `${cluster.sfPercentage ?? cluster.percentage}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-semibold text-slate-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
                            Cluster (70%):
                          </span>
                          <span className="font-bold text-blue-700">
                            {cluster.clrPercentage || 0}%{' '}
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({cluster.clrContribution || 0}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${cluster.clrPercentage || 0}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-semibold text-slate-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 inline-block"></span>
                            Subfeeder (30%):
                          </span>
                          <span className="font-bold text-purple-700">
                            {cluster.sfPercentage || 0}%{' '}
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({cluster.sfContribution || 0}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-purple-600 transition-all duration-300"
                            style={{ width: `${cluster.sfPercentage || 0}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Scope Pole & Cable quick stats: Left = Cluster, Right = Subfeeder (or Main Feeder) */}
                {(() => {
                  const summary = summarizeScopePoleCable(cluster);
                  if (cluster.projectType === 'MAIN_FEEDER') {
                    return (
                      <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] sm:text-xs grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-600">
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="truncate text-slate-500">Pole Feeder:</span>
                          <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                            {formatCardStat(summary.mfPole.installed)} / {formatCardStat(summary.mfPole.boq)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="truncate text-slate-500">Kabel Feeder:</span>
                          <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                            {formatCardStat(summary.mfCable.installed)} / {formatCardStat(summary.mfCable.boq)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] sm:text-xs grid grid-cols-2 gap-x-3 text-slate-600">
                      <div className="space-y-1.5 pr-2 border-r border-slate-100 min-w-0">
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="truncate text-slate-500" title="Total Pole Cluster">
                            Pole Cluster:
                          </span>
                          <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                            {formatCardStat(summary.clrPole.installed)} / {formatCardStat(summary.clrPole.boq)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="truncate text-slate-500" title="Total Kabel Cluster (m)">
                            Kabel Cluster:
                          </span>
                          <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                            {formatCardStat(summary.clrCable.installed)} / {formatCardStat(summary.clrCable.boq)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="truncate text-slate-500" title="Total Pole Subfeeder">
                            Pole Subfeeder:
                          </span>
                          <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                            {formatCardStat(summary.sfPole.installed)} / {formatCardStat(summary.sfPole.boq)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="truncate text-slate-500" title="Total Kabel Subfeeder (m)">
                            Kabel Subfeeder:
                          </span>
                          <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                            {formatCardStat(summary.sfCable.installed)} / {formatCardStat(summary.sfCable.boq)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 pt-2 flex items-center justify-between">
                  <Link
                    href={`/daily-input?clusterId=${cluster.id}`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                  >
                    + Input Harian
                  </Link>
                  <Link
                    href={`/matrix?clusterId=${cluster.id}`}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Detail Matriks &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
