'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ProjectSummary, CategoryProgress, ClusterWithProgress } from '@/types';
import {
  Layers,
  TrendingUp,
  HardHat,
  Cable,
  MapPin,
  Filter,
  PlusCircle,
  Users,
  Search,
  Table2,
  LayoutGrid,
  X,
} from 'lucide-react';

function summarizeScopePoleCable(cluster: ClusterWithProgress) {
  const sumBy = (
    targetScope: 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER' | 'ALL',
    targetCategory: 'POLE' | 'CABLE' | 'FAT' | 'FDT' | 'JC'
  ) => {
    let boq = 0;
    let installed = 0;
    for (const it of cluster.workItems) {
      const itemScope = it.scope || 'CLUSTER';
      const matchesScope =
        targetScope === 'ALL'
          ? true
          : targetScope === 'MAIN_FEEDER'
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
    fat: sumBy('ALL', 'FAT'),
    fdt: sumBy('ALL', 'FDT'),
    mfPole: sumBy('MAIN_FEEDER', 'POLE'),
    mfCable: sumBy('MAIN_FEEDER', 'CABLE'),
    mfJc: sumBy('MAIN_FEEDER', 'JC'),
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [projectTypeFilter, setProjectTypeFilter] = useState<'ALL' | 'CLUSTER_SF' | 'MAIN_FEEDER'>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARD'>('TABLE');

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

    const sumCategory = (key: 'POLE' | 'CABLE') => {
      let boq = 0;
      let installed = 0;
      for (const c of filteredClusters) {
        for (const it of c.workItems) {
          if (it.category === key) {
            boq += it.boq;
            const effectiveInstalled =
              it.status === 'DONE' ? Math.max(it.installed, it.boq) : it.installed;
            installed += effectiveInstalled;
          }
        }
      }
      const percentage = boq > 0 ? Math.min(100, Math.round((installed / boq) * 100)) : 0;
      return {
        boq: Math.round(boq * 10) / 10,
        installed: Math.round(installed * 10) / 10,
        percentage,
      };
    };

    const poleCategory = sumCategory('POLE');
    const cableCategory = sumCategory('CABLE');

    return {
      totalClusters,
      overallProgress,
      totalPoleInstalled: poleCategory.installed,
      totalPoleBoq: poleCategory.boq,
      polePercentage: poleCategory.percentage,
      totalCableInstalled: cableCategory.installed,
      totalCableBoq: cableCategory.boq,
      cablePercentage: cableCategory.percentage,
    };
  }, [filteredClusters]);

  const displayedClusters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return filteredClusters.filter((c) => {
      const pType = c.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF';
      if (projectTypeFilter !== 'ALL' && pType !== projectTypeFilter) return false;
      if (!q) return true;
      const teamText = (c.teamNames || []).join(' ').toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.clusterName || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.kecamatan || '').toLowerCase().includes(q) ||
        (c.oltName || '').toLowerCase().includes(q) ||
        teamText.includes(q)
      );
    });
  }, [filteredClusters, searchQuery, projectTypeFilter]);

  const clusterRowsWithStats = useMemo(() => {
    return displayedClusters.map((cluster) => ({
      cluster,
      summary: summarizeScopePoleCable(cluster),
    }));
  }, [displayedClusters]);

  const clusterOnlyRows = useMemo(
    () => clusterRowsWithStats.filter((r) => r.cluster.projectType !== 'MAIN_FEEDER'),
    [clusterRowsWithStats]
  );

  const mainFeederRows = useMemo(
    () => clusterRowsWithStats.filter((r) => r.cluster.projectType === 'MAIN_FEEDER'),
    [clusterRowsWithStats]
  );

  const regionCounts = useMemo(() => {
    const mfCount = filteredClusters.filter((c) => c.projectType === 'MAIN_FEEDER').length;
    return {
      clusterCount: filteredClusters.length - mfCount,
      mainFeederCount: mfCount,
    };
  }, [filteredClusters]);

  const clusterTotals = useMemo(() => {
    const totals = {
      hp: 0,
      clrPoleInst: 0,
      clrPoleBoq: 0,
      clrCableInst: 0,
      clrCableBoq: 0,
      sfPoleInst: 0,
      sfPoleBoq: 0,
      sfCableInst: 0,
      sfCableBoq: 0,
      fatInst: 0,
      fatBoq: 0,
      fdtInst: 0,
      fdtBoq: 0,
    };
    for (const { cluster, summary } of clusterOnlyRows) {
      totals.hp += cluster.homePasses || 0;
      totals.clrPoleInst += summary.clrPole.installed;
      totals.clrPoleBoq += summary.clrPole.boq;
      totals.clrCableInst += summary.clrCable.installed;
      totals.clrCableBoq += summary.clrCable.boq;
      totals.sfPoleInst += summary.sfPole.installed;
      totals.sfPoleBoq += summary.sfPole.boq;
      totals.sfCableInst += summary.sfCable.installed;
      totals.sfCableBoq += summary.sfCable.boq;
      totals.fatInst += summary.fat.installed;
      totals.fatBoq += summary.fat.boq;
      totals.fdtInst += summary.fdt.installed;
      totals.fdtBoq += summary.fdt.boq;
    }
    return totals;
  }, [clusterOnlyRows]);

  const mfTotals = useMemo(() => {
    const totals = {
      hp: 0,
      poleInst: 0,
      poleBoq: 0,
      cableInst: 0,
      cableBoq: 0,
      jcInst: 0,
      jcBoq: 0,
    };
    for (const { cluster, summary } of mainFeederRows) {
      totals.hp += cluster.homePasses || 0;
      totals.poleInst += summary.mfPole.installed;
      totals.poleBoq += summary.mfPole.boq;
      totals.cableInst += summary.mfCable.installed;
      totals.cableBoq += summary.mfCable.boq;
      totals.jcInst += summary.mfJc.installed;
      totals.jcBoq += summary.mfJc.boq;
    }
    return totals;
  }, [mainFeederRows]);

  const renderClusterCard = (cluster: ClusterWithProgress) => {
    const summary = summarizeScopePoleCable(cluster);
    return (
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
            <div
              className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 min-w-0"
              title={
                cluster.teamNames && cluster.teamNames.length > 0
                  ? `Tim Pelaksana: ${cluster.teamNames.join(', ')}`
                  : 'Belum ada input tim pelaksana'
              }
            >
              <Users className="w-3 h-3 text-blue-600 shrink-0" />
              <span className="shrink-0">Tim:</span>
              {cluster.teamNames && cluster.teamNames.length > 0 ? (
                <span className="font-semibold text-slate-700 truncate">
                  {cluster.teamNames.length > 2
                    ? `${cluster.teamNames.slice(0, 2).join(', ')} (+${cluster.teamNames.length - 2})`
                    : cluster.teamNames.join(', ')}
                </span>
              ) : (
                <span className="text-slate-400 italic truncate">Belum ada input</span>
              )}
            </div>
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

        {/* Scope Breakdown Bars */}
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

        {/* Scope quick stats */}
        {cluster.projectType === 'MAIN_FEEDER' ? (
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
            {(summary.mfJc.boq > 0 || summary.mfJc.installed > 0) && (
              <div className="flex items-center justify-between gap-1 min-w-0 col-span-2 pt-1 border-t border-slate-100">
                <span className="truncate text-slate-500">Joint Closure (JC):</span>
                <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                  {formatCardStat(summary.mfJc.installed)} / {formatCardStat(summary.mfJc.boq)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] sm:text-xs text-slate-600 space-y-2">
            <div className="grid grid-cols-2 gap-x-3">
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

            <div className="grid grid-cols-2 gap-x-3 pt-1.5 border-t border-slate-100">
              <div className="flex items-center justify-between gap-1 pr-2 border-r border-slate-100 min-w-0">
                <span className="truncate text-slate-500" title="Status Terminasi FAT">
                  FAT:
                </span>
                <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                  {formatCardStat(summary.fat.installed)} / {formatCardStat(summary.fat.boq)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="truncate text-slate-500" title="Status Terminasi FDT">
                  FDT:
                </span>
                <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                  {formatCardStat(summary.fdt.installed)} / {formatCardStat(summary.fdt.boq)}
                </span>
              </div>
            </div>
          </div>
        )}

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
    );
  };

  const activeRegionText =
    selectedKecamatan !== 'ALL'
      ? `Kecamatan ${selectedKecamatan} (${selectedKabupaten !== 'ALL' ? `Kab. ${selectedKabupaten}` : 'Kab. Blora'})`
      : selectedKabupaten !== 'ALL'
      ? `Kabupaten ${selectedKabupaten}`
      : `${project.name} (Semua Wilayah)`;

  return (
    <div className="space-y-5">
      {/* Compact Regional Filter Strip */}
      <div className="bg-white rounded-2xl px-4 py-3 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {activeRegionText}
            </span>
            {(selectedKecamatan !== 'ALL' || selectedKabupaten !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedKabupaten('ALL');
                  setSelectedKecamatan('ALL');
                }}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          <select
            value={selectedKabupaten}
            onChange={(e) => setSelectedKabupaten(e.target.value)}
            aria-label="Filter Kabupaten"
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Semua Kabupaten</option>
            {kabupatenOptions.map((kab) => (
              <option key={kab} value={kab}>
                Kab. {kab}
              </option>
            ))}
          </select>

          <select
            value={selectedKecamatan}
            onChange={(e) => setSelectedKecamatan(e.target.value)}
            aria-label="Filter Kecamatan"
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Semua Kecamatan</option>
            {kecamatanOptions.map((kec) => (
              <option key={kec} value={kec}>
                Kec. {kec}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <span className="text-xs font-semibold uppercase tracking-wider">Total Area Aktif</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {regionCounts.clusterCount}
            </span>
            <span className="text-xs text-slate-500">cluster</span>
            {regionCounts.mainFeederCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                +{regionCounts.mainFeederCount} Main Feeder
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {selectedKecamatan !== 'ALL'
              ? `Wilayah Kec. ${selectedKecamatan}`
              : selectedKabupaten !== 'ALL'
              ? `Wilayah Kab. ${selectedKabupaten}`
              : `${dynamicStats.totalClusters} total area (${regionCounts.clusterCount} Cluster, ${regionCounts.mainFeederCount} MF)`}
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

      {/* Cluster Progress Overview Table & Cards */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Monitoring Progres Pekerjaan ({displayedClusters.length}
              {displayedClusters.length !== filteredClusters.length ? ` / ${filteredClusters.length}` : ''})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dipisah per kategori Cluster + Subfeeder dan Main Feeder (100% Feeder) pada {activeRegionText}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Tabs */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setProjectTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  projectTypeFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({filteredClusters.length})
              </button>
              <button
                type="button"
                onClick={() => setProjectTypeFilter('CLUSTER_SF')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  projectTypeFilter === 'CLUSTER_SF'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cluster ({regionCounts.clusterCount})
              </button>
              <button
                type="button"
                onClick={() => setProjectTypeFilter('MAIN_FEEDER')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  projectTypeFilter === 'MAIN_FEEDER'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Main Feeder ({regionCounts.mainFeederCount})
              </button>
            </div>

            {/* View Toggle: Tabel vs Card */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  viewMode === 'TABLE'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('CARD')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  viewMode === 'CARD'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Card</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search Toolbar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama cluster / Main Feeder, OLT, kecamatan, atau tim pelaksana..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              title="Bersihkan pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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
        ) : displayedClusters.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
            <p className="text-sm font-semibold text-slate-600">
              Tidak ada data yang cocok dengan pencarian &quot;{searchQuery}&quot;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setProjectTypeFilter('ALL');
              }}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition"
            >
              Reset Filter Pencarian
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* KATEGORI 1: CLUSTER & SUBFEEDER */}
            {(projectTypeFilter === 'ALL' || projectTypeFilter === 'CLUSTER_SF') &&
              clusterOnlyRows.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                        CLUSTER &amp; SUBFEEDER ({clusterOnlyRows.length})
                      </span>
                      <span className="text-xs text-slate-500 hidden sm:inline">
                        Bobot 70% Cluster + 30% Subfeeder
                      </span>
                    </div>
                  </div>

                  {viewMode === 'TABLE' ? (
                    <div className="overflow-x-auto table-scrollbar border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-2.5 py-3 text-center w-9">No</th>
                            <th className="px-3 py-3 min-w-[180px]">Nama Cluster</th>
                            <th className="px-3 py-3 min-w-[150px]">Tim Pelaksana</th>
                            <th className="px-2.5 py-3 text-center whitespace-nowrap">Total %</th>
                            <th className="px-2.5 py-3 text-center whitespace-nowrap">CLR / SF</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Pole CLR</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Kabel CLR (m)</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Pole SF</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Kabel SF (m)</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">FAT</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">FDT</th>
                            <th className="px-3 py-3 text-right whitespace-nowrap">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {clusterOnlyRows.map(({ cluster, summary }, idx) => (
                            <tr key={cluster.id} className="hover:bg-blue-50/30 transition">
                              <td className="px-2.5 py-2.5 text-center text-slate-400 font-medium">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-bold text-slate-900 break-all" title={cluster.name}>
                                  {cluster.name}
                                </span>
                                <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-1.5">
                                  {cluster.kecamatan && <span>Kec. {cluster.kecamatan}</span>}
                                  {cluster.oltName && <span>• {cluster.oltName}</span>}
                                  <span>• HP: {cluster.homePasses || '-'}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {cluster.teamNames && cluster.teamNames.length > 0 ? (
                                  <div
                                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-800"
                                    title={cluster.teamNames.join(', ')}
                                  >
                                    <Users className="w-3 h-3 text-blue-600 shrink-0" />
                                    <span>
                                      {cluster.teamNames.length > 2
                                        ? `${cluster.teamNames.slice(0, 2).join(', ')} (+${cluster.teamNames.length - 2})`
                                        : cluster.teamNames.join(', ')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Belum ada input</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                                <div className="inline-flex flex-col items-center gap-1 min-w-[54px]">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                                      cluster.percentage >= 100
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : cluster.percentage > 0
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {cluster.percentage}%
                                  </span>
                                  <div className="w-12 bg-slate-200 rounded-full h-1 overflow-hidden">
                                    <div
                                      className={`h-1 rounded-full ${
                                        cluster.percentage >= 100 ? 'bg-emerald-500' : 'bg-blue-600'
                                      }`}
                                      style={{ width: `${Math.min(100, cluster.percentage)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-center whitespace-nowrap text-[10px]">
                                <div className="space-y-0.5">
                                  <div className="text-blue-700 font-semibold">
                                    CLR: {cluster.clrPercentage || 0}%
                                  </div>
                                  <div className="text-purple-700 font-semibold">
                                    SF: {cluster.sfPercentage || 0}%
                                  </div>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.clrPole.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.clrPole.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.clrCable.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.clrCable.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.sfPole.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.sfPole.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.sfCable.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.sfCable.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.fat.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.fat.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.fdt.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.fdt.boq)}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <Link
                                    href={`/daily-input?clusterId=${cluster.id}`}
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-[11px] transition"
                                  >
                                    + Input
                                  </Link>
                                  <Link
                                    href={`/matrix?clusterId=${cluster.id}`}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] transition"
                                  >
                                    Matriks
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800 text-[11px]">
                          <tr>
                            <td colSpan={5} className="px-3 py-2.5 text-right">
                              Total Cluster ({clusterOnlyRows.length} Cluster • {clusterTotals.hp.toLocaleString('en-US')} HP):
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(clusterTotals.clrPoleInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(clusterTotals.clrPoleBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(clusterTotals.clrCableInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(clusterTotals.clrCableBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(clusterTotals.sfPoleInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(clusterTotals.sfPoleBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(clusterTotals.sfCableInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(clusterTotals.sfCableBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(clusterTotals.fatInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(clusterTotals.fatBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(clusterTotals.fdtInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(clusterTotals.fdtBoq * 10) / 10)}
                              </span>
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {clusterOnlyRows.map(({ cluster }) => renderClusterCard(cluster))}
                    </div>
                  )}
                </div>
              )}

            {/* KATEGORI 2: MAIN FEEDER (100% FEEDER) */}
            {(projectTypeFilter === 'ALL' || projectTypeFilter === 'MAIN_FEEDER') &&
              mainFeederRows.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        MAIN FEEDER ({mainFeederRows.length})
                      </span>
                      <span className="text-xs text-slate-500 hidden sm:inline">
                        Pekerjaan Feeder / Backbone • Bobot 100% Feeder (Tanpa Cluster)
                      </span>
                    </div>
                  </div>

                  {viewMode === 'TABLE' ? (
                    <div className="overflow-x-auto table-scrollbar border border-indigo-200/70 rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-indigo-50/70 text-slate-700 font-bold border-b border-indigo-200/70">
                          <tr>
                            <th className="px-2.5 py-3 text-center w-9">No</th>
                            <th className="px-3 py-3 min-w-[230px]">Link Main Feeder</th>
                            <th className="px-3 py-3 min-w-[150px]">Tim Pelaksana</th>
                            <th className="px-2.5 py-3 text-center whitespace-nowrap">Progress %</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Pole Feeder</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Kabel Feeder (m)</th>
                            <th className="px-2.5 py-3 text-right whitespace-nowrap">Joint Closure (JC)</th>
                            <th className="px-3 py-3 text-right whitespace-nowrap">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {mainFeederRows.map(({ cluster, summary }, idx) => (
                            <tr key={cluster.id} className="hover:bg-indigo-50/30 transition">
                              <td className="px-2.5 py-2.5 text-center text-slate-400 font-medium">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-900 break-all" title={cluster.name}>
                                    {cluster.name}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0">
                                    MF 100%
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-1.5">
                                  {cluster.kecamatan && <span>Kec. {cluster.kecamatan}</span>}
                                  {cluster.oltName && <span>• {cluster.oltName}</span>}
                                  {cluster.code && <span>• {cluster.code}</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {cluster.teamNames && cluster.teamNames.length > 0 ? (
                                  <div
                                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-800"
                                    title={cluster.teamNames.join(', ')}
                                  >
                                    <Users className="w-3 h-3 text-indigo-600 shrink-0" />
                                    <span>
                                      {cluster.teamNames.length > 2
                                        ? `${cluster.teamNames.slice(0, 2).join(', ')} (+${cluster.teamNames.length - 2})`
                                        : cluster.teamNames.join(', ')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Belum ada input</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                                <div className="inline-flex flex-col items-center gap-1 min-w-[54px]">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                                      cluster.percentage >= 100
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : cluster.percentage > 0
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {cluster.percentage}%
                                  </span>
                                  <div className="w-12 bg-slate-200 rounded-full h-1 overflow-hidden">
                                    <div
                                      className={`h-1 rounded-full ${
                                        cluster.percentage >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                                      }`}
                                      style={{ width: `${Math.min(100, cluster.percentage)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.mfPole.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.mfPole.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.mfCable.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.mfCable.boq)}</span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                                <strong className="text-slate-900">{formatCardStat(summary.mfJc.installed)}</strong>
                                <span className="text-slate-400"> / {formatCardStat(summary.mfJc.boq)}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <Link
                                    href={`/daily-input?clusterId=${cluster.id}`}
                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] transition"
                                  >
                                    + Input
                                  </Link>
                                  <Link
                                    href={`/matrix?clusterId=${cluster.id}`}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] transition"
                                  >
                                    Matriks
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-indigo-50/40 border-t border-indigo-200/70 font-bold text-slate-800 text-[11px]">
                          <tr>
                            <td colSpan={4} className="px-3 py-2.5 text-right">
                              Total Main Feeder ({mainFeederRows.length} Link):
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(mfTotals.poleInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(mfTotals.poleBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(mfTotals.cableInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(mfTotals.cableBoq * 10) / 10)}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                              {formatCardStat(Math.round(mfTotals.jcInst * 10) / 10)} /{' '}
                              <span className="text-slate-500 font-semibold">
                                {formatCardStat(Math.round(mfTotals.jcBoq * 10) / 10)}
                              </span>
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {mainFeederRows.map(({ cluster }) => renderClusterCard(cluster))}
                    </div>
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
