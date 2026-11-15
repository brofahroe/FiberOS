'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  SitelistEntry,
  RegionSummaryItem,
  createOrActivateSitelistCluster,
  activateAllSitelistClusters,
} from '@/actions/sitelist';
import {
  MapPin,
  Building2,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Layers,
  Edit3,
  X,
  Check,
  HardHat,
  Cable,
  Box,
  Cpu,
} from 'lucide-react';

export default function SitelistClient({
  initialEntries,
  kecamatanSummaries,
  kabupatenSummaries,
  kecamatanList,
  kabupatenList,
  oltList,
}: {
  initialEntries: SitelistEntry[];
  kecamatanSummaries: RegionSummaryItem[];
  kabupatenSummaries: RegionSummaryItem[];
  kecamatanList: string[];
  kabupatenList: string[];
  oltList: string[];
}) {
  const router = useRouter();

  // Summary grouping mode: KECAMATAN vs KABUPATEN
  const [summaryMode, setSummaryMode] = useState<'KECAMATAN' | 'KABUPATEN'>('KECAMATAN');
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('ALL');
  const [selectedKecamatan, setSelectedKecamatan] = useState<string>('ALL');
  const [selectedOlt, setSelectedOlt] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNPROVISIONED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action states
  const [activatingKey, setActivatingKey] = useState<string | null>(null);
  const [activatingAll, setActivatingAll] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add / Edit New Cluster Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [isEditingExisting, setIsEditingExisting] = useState<boolean>(false);
  const [submittingModal, setSubmittingModal] = useState<boolean>(false);
  const [formEmrSiteCode, setFormEmrSiteCode] = useState<string>('');
  const [formSubfeederId, setFormSubfeederId] = useState<string>('');
  const [formClusterId, setFormClusterId] = useState<string>('');
  const [formClusterName, setFormClusterName] = useState<string>('');
  const [formShortName, setFormShortName] = useState<string>('');
  const [formOltName, setFormOltName] = useState<string>('OLT Balun');
  const [formKecamatan, setFormKecamatan] = useState<string>('Kedungtuban');
  const [formKabupaten, setFormKabupaten] = useState<string>('Blora');
  const [formHomePasses, setFormHomePasses] = useState<string>('0');

  // Filtered entries for table & dynamic KPI summary
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return initialEntries.filter((entry) => {
      if (selectedKabupaten !== 'ALL' && entry.kabupaten !== selectedKabupaten) return false;
      if (selectedKecamatan !== 'ALL' && entry.kecamatan !== selectedKecamatan) return false;
      if (selectedOlt !== 'ALL' && entry.oltName !== selectedOlt) return false;
      if (statusFilter === 'ACTIVE' && !entry.isProvisioned) return false;
      if (statusFilter === 'UNPROVISIONED' && entry.isProvisioned) return false;

      if (q) {
        const match =
          entry.shortName.toLowerCase().includes(q) ||
          entry.clusterName.toLowerCase().includes(q) ||
          entry.clusterId.toLowerCase().includes(q) ||
          entry.subfeederId.toLowerCase().includes(q) ||
          entry.emrSiteCode.toLowerCase().includes(q) ||
          entry.oltName.toLowerCase().includes(q) ||
          entry.kecamatan.toLowerCase().includes(q) ||
          entry.kabupaten.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [initialEntries, selectedKabupaten, selectedKecamatan, selectedOlt, statusFilter, searchQuery]);

  // Dynamic KPI Summary for currently selected Kecamatan / Kabupaten filter
  const currentFilterStats = useMemo(() => {
    const totalSites = filteredEntries.length;
    const activeList = filteredEntries.filter((e) => e.isProvisioned);
    const activeCount = activeList.length;
    const completedCount = activeList.filter((e) => e.status === 'COMPLETED').length;
    const inProgressCount = activeList.filter((e) => e.status === 'IN_PROGRESS').length;
    const totalHp = filteredEntries.reduce((sum, e) => sum + e.homePasses, 0);

    const avgActiveProgress =
      activeCount > 0
        ? Math.round((activeList.reduce((sum, e) => sum + e.percentage, 0) / activeCount) * 10) / 10
        : 0;
    const avgClr =
      activeCount > 0
        ? Math.round((activeList.reduce((sum, e) => sum + e.clrPercentage, 0) / activeCount) * 10) / 10
        : 0;
    const avgSf =
      activeCount > 0
        ? Math.round((activeList.reduce((sum, e) => sum + e.sfPercentage, 0) / activeCount) * 10) / 10
        : 0;

    return {
      totalSites,
      activeCount,
      unprovisionedCount: totalSites - activeCount,
      completedCount,
      inProgressCount,
      totalHp,
      avgActiveProgress,
      avgClr,
      avgSf,
      poleInstalled: filteredEntries.reduce((s, e) => s + e.poleInstalled, 0),
      poleBoq: filteredEntries.reduce((s, e) => s + e.poleBoq, 0),
      cableInstalled: filteredEntries.reduce((s, e) => s + e.cableInstalled, 0),
      cableBoq: filteredEntries.reduce((s, e) => s + e.cableBoq, 0),
      fatInstalled: filteredEntries.reduce((s, e) => s + e.fatInstalled, 0),
      fatBoq: filteredEntries.reduce((s, e) => s + e.fatBoq, 0),
      fdtInstalled: filteredEntries.reduce((s, e) => s + e.fdtInstalled, 0),
      fdtBoq: filteredEntries.reduce((s, e) => s + e.fdtBoq, 0),
    };
  }, [filteredEntries]);

  const openNewClusterModal = () => {
    setIsEditingExisting(false);
    setFormEmrSiteCode('');
    setFormSubfeederId('');
    setFormClusterId('');
    setFormClusterName('');
    setFormShortName('');
    setFormOltName('OLT Balun');
    setFormKecamatan(selectedKecamatan !== 'ALL' ? selectedKecamatan : 'Kedungtuban');
    setFormKabupaten(selectedKabupaten !== 'ALL' ? selectedKabupaten : 'Blora');
    setFormHomePasses('0');
    setShowAddModal(true);
  };

  const openEditClusterModal = (entry: SitelistEntry) => {
    setIsEditingExisting(entry.isProvisioned);
    setFormEmrSiteCode(entry.emrSiteCode === '-' ? '' : entry.emrSiteCode);
    setFormSubfeederId(entry.subfeederId);
    setFormClusterId(entry.clusterId);
    setFormClusterName(entry.clusterName);
    setFormShortName(entry.shortName);
    setFormOltName(entry.oltName);
    setFormKecamatan(entry.kecamatan);
    setFormKabupaten(entry.kabupaten);
    setFormHomePasses(String(entry.homePasses || 0));
    setShowAddModal(true);
  };

  const handleActivateEntry = async (entry: SitelistEntry) => {
    setActivatingKey(entry.key);
    setFeedback(null);
    const res = await createOrActivateSitelistCluster({
      emrSiteCode: entry.emrSiteCode,
      subfeederId: entry.subfeederId,
      clusterId: entry.clusterId,
      clusterName: entry.clusterName,
      shortName: entry.shortName,
      oltName: entry.oltName,
      kecamatan: entry.kecamatan,
      kabupaten: entry.kabupaten,
      homePasses: entry.homePasses,
    });
    setActivatingKey(null);

    if (res.success) {
      setFeedback({ type: 'success', text: res.message || 'Cluster berhasil diaktifkan!' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal mengaktifkan cluster.' });
    }
  };

  const handleActivateAll = async () => {
    const scopeLabel =
      selectedKecamatan !== 'ALL' ? `Kecamatan ${selectedKecamatan}` : 'seluruh Sitelist';
    if (!confirm(`Aktifkan semua cluster yang belum terdaftar pada ${scopeLabel}?`)) return;

    setActivatingAll(true);
    setFeedback(null);
    const res = await activateAllSitelistClusters(selectedKecamatan);
    setActivatingAll(false);

    if (res.success) {
      setFeedback({ type: 'success', text: res.message || 'Berhasil mengaktifkan sitelist!' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal mengaktifkan sitelist.' });
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formShortName.trim()) {
      setFeedback({ type: 'error', text: 'Short Name / Nama Cluster wajib diisi.' });
      return;
    }

    setSubmittingModal(true);
    setFeedback(null);

    const shortClean = formShortName.trim().toUpperCase();
    const res = await createOrActivateSitelistCluster({
      emrSiteCode: formEmrSiteCode.trim() || '-',
      subfeederId: formSubfeederId.trim() || `SFM07-99-${shortClean}`,
      clusterId: formClusterId.trim() || `CLRM07-99-${shortClean}`,
      clusterName: formClusterName.trim().toUpperCase() || `KELURAHAN ${shortClean} ${formKabupaten.toUpperCase()}`,
      shortName: shortClean,
      oltName: formOltName.trim() || 'OLT Balun',
      kecamatan: formKecamatan.trim() || 'Kedungtuban',
      kabupaten: formKabupaten.trim() || 'Blora',
      homePasses: parseInt(formHomePasses, 10) || 0,
    });

    setSubmittingModal(false);

    if (res.success) {
      setShowAddModal(false);
      setFeedback({ type: 'success', text: res.message || 'Cluster berhasil disimpan!' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menyimpan cluster.' });
    }
  };

  const displayedSummaries =
    summaryMode === 'KECAMATAN' ? kecamatanSummaries : kabupatenSummaries;

  const activeRegionLabel =
    selectedKecamatan !== 'ALL'
      ? `Kecamatan ${selectedKecamatan} (${selectedKabupaten !== 'ALL' ? selectedKabupaten : 'Kab. Blora'})`
      : selectedKabupaten !== 'ALL'
      ? `Kabupaten ${selectedKabupaten}`
      : 'Semua Wilayah (Kabupaten & Kecamatan)';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span>Referensi Master Sitelist.xlsx</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Master Sitelist & Summary Wilayah
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar resmi EMR Site Code, Subfeeder ID, Cluster ID, OLT, serta ringkasan progres per Kecamatan & Kabupaten.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {currentFilterStats.unprovisionedCount > 0 && (
            <button
              type="button"
              onClick={handleActivateAll}
              disabled={activatingAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
            >
              {activatingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span>
                Aktifkan Semua ({currentFilterStats.unprovisionedCount} Site)
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={openNewClusterModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Tambah Cluster Baru</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: Summary Selector (Per Kecamatan vs Per Kabupaten) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>Summary Progres Wilayah ({summaryMode === 'KECAMATAN' ? 'Per Kecamatan' : 'Per Kabupaten'})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik kartu Kecamatan atau Kabupaten di bawah untuk memfilter ringkasan dan tabel Sitelist.
            </p>
          </div>

          {/* Toggle Per Kecamatan / Per Kabupaten */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setSummaryMode('KECAMATAN');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                summaryMode === 'KECAMATAN'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Per Kecamatan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSummaryMode('KABUPATEN');
                setSelectedKecamatan('ALL');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                summaryMode === 'KABUPATEN'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Per Kabupaten</span>
            </button>
          </div>
        </div>

        {/* Region Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card: Semua Wilayah */}
          <div
            onClick={() => {
              setSelectedKabupaten('ALL');
              setSelectedKecamatan('ALL');
            }}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              selectedKabupaten === 'ALL' && selectedKecamatan === 'ALL'
                ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md">
                  Total Keseluruhan
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-1">
                  Semua Wilayah ({initialEntries.length} Site)
                </h3>
                <p className="text-[11px] text-slate-500">
                  {kecamatanList.length} Kecamatan • {kabupatenList.length} Kabupaten
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-blue-700">
                  {initialEntries.filter((e) => e.isProvisioned).length > 0
                    ? Math.round(
                        (initialEntries
                          .filter((e) => e.isProvisioned)
                          .reduce((s, e) => s + e.percentage, 0) /
                          initialEntries.filter((e) => e.isProvisioned).length) *
                          10
                      ) / 10
                    : 0}
                  %
                </span>
                <span className="block text-[10px] text-slate-400">rata-rata aktif</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Total Site</span>
                <strong className="text-slate-800">{initialEntries.length} Site</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Cluster Aktif</span>
                <strong className="text-emerald-700">
                  {initialEntries.filter((e) => e.isProvisioned).length} Aktif
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Total HP</span>
                <strong className="text-slate-800">
                  {initialEntries.reduce((s, e) => s + e.homePasses, 0).toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          {/* Cards per Kecamatan or Kabupaten */}
          {displayedSummaries.map((reg) => {
            const isSelected =
              summaryMode === 'KECAMATAN'
                ? selectedKecamatan === reg.regionName
                : selectedKabupaten === reg.regionName && selectedKecamatan === 'ALL';

            return (
              <div
                key={`${reg.regionType}-${reg.regionName}`}
                onClick={() => {
                  if (summaryMode === 'KECAMATAN') {
                    setSelectedKecamatan(
                      selectedKecamatan === reg.regionName ? 'ALL' : reg.regionName
                    );
                    if (reg.parentKabupaten) setSelectedKabupaten(reg.parentKabupaten);
                  } else {
                    setSelectedKabupaten(
                      selectedKabupaten === reg.regionName ? 'ALL' : reg.regionName
                    );
                    setSelectedKecamatan('ALL');
                  }
                }}
                className={`p-4 rounded-2xl border cursor-pointer transition ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      {reg.regionType === 'KECAMATAN'
                        ? `Kecamatan • Kab. ${reg.parentKabupaten}`
                        : 'Kabupaten'}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 mt-1">
                      {reg.regionType === 'KECAMATAN' ? `Kec. ${reg.regionName}` : `Kab. ${reg.regionName}`}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-slate-900">
                      {reg.avgActiveProgress}%
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      CLR {reg.avgClrProgress}% | SF {reg.avgSfProgress}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, reg.avgActiveProgress)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Sitelist / Aktif</span>
                    <strong className="text-slate-800">
                      {reg.activeClusters} / {reg.totalSites} Site
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Selesai / Jalan</span>
                    <strong className="text-emerald-700">
                      {reg.completedClusters} Done • {reg.inProgressClusters} On
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Home Pass</span>
                    <strong className="text-slate-800">{reg.totalHomePasses.toLocaleString()} HP</strong>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                  <div>
                    Tiang: <strong className="text-slate-800">{reg.poleInstalled.toLocaleString()}</strong>/{reg.poleBoq.toLocaleString()}
                  </div>
                  <div>
                    Kabel: <strong className="text-slate-800">{reg.cableInstalled.toLocaleString()}</strong>/{reg.cableBoq.toLocaleString()}m
                  </div>
                  <div>
                    FAT: <strong className="text-slate-800">{reg.fatInstalled.toLocaleString()}</strong>/{reg.fatBoq.toLocaleString()}
                  </div>
                  <div>
                    FDT: <strong className="text-slate-800">{reg.fdtInstalled.toLocaleString()}</strong>/{reg.fdtBoq.toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Wilayah Detailed Material Summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                📊 Ringkasan Material & Progres: {activeRegionLabel}
              </span>
            </div>
            <span className="text-xs font-semibold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
              {currentFilterStats.activeCount} Cluster Aktif dari {currentFilterStats.totalSites} Site ({currentFilterStats.totalHp.toLocaleString()} HP)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <HardHat className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Tiang (Poles)</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {currentFilterStats.poleInstalled.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    / {currentFilterStats.poleBoq.toLocaleString()} Btg
                  </span>
                </span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Cable className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Penarikan Kabel</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {currentFilterStats.cableInstalled.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    / {currentFilterStats.cableBoq.toLocaleString()} m
                  </span>
                </span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <Box className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Terminasi FAT</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {currentFilterStats.fatInstalled.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    / {currentFilterStats.fatBoq.toLocaleString()} Unit
                  </span>
                </span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Terminasi FDT</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {currentFilterStats.fdtInstalled.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    / {currentFilterStats.fdtBoq.toLocaleString()} Unit
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Filter Bar & Sitelist Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700">Kabupaten:</span>
              <select
                value={selectedKabupaten}
                onChange={(e) => setSelectedKabupaten(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua Kabupaten</option>
                {kabupatenList.map((kab) => (
                  <option key={kab} value={kab}>
                    {kab}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">Kecamatan:</span>
              <select
                value={selectedKecamatan}
                onChange={(e) => setSelectedKecamatan(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua Kecamatan</option>
                {kecamatanList.map((kec) => (
                  <option key={kec} value={kec}>
                    {kec}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">OLT:</span>
              <select
                value={selectedOlt}
                onChange={(e) => setSelectedOlt(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua OLT</option>
                {oltList.map((olt) => (
                  <option key={olt} value={olt}>
                    {olt}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'UNPROVISIONED')}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua ({initialEntries.length})</option>
                <option value="ACTIVE">
                  Aktif di Proyek ({initialEntries.filter((e) => e.isProvisioned).length})
                </option>
                <option value="UNPROVISIONED">
                  Belum Diaktifkan ({initialEntries.filter((e) => !e.isProvisioned).length})
                </option>
              </select>
            </div>
          </div>

          <div className="relative w-full lg:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari EMR Code, Cluster ID, Nama, Kecamatan..."
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2 pointer-events-none" />
          </div>
        </div>

        {/* Sitelist Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-2.5 py-3 text-center w-9">No</th>
                <th className="px-2.5 py-3 whitespace-nowrap">EMR Site Code</th>
                <th className="px-2.5 py-3 whitespace-nowrap">Subfeeder ID</th>
                <th className="px-2.5 py-3 whitespace-nowrap">Cluster ID</th>
                <th className="px-2.5 py-3">Cluster Name</th>
                <th className="px-2.5 py-3 whitespace-nowrap">Short Name</th>
                <th className="px-2.5 py-3 whitespace-nowrap">OLT Name</th>
                <th className="px-2.5 py-3 whitespace-nowrap">Kecamatan</th>
                <th className="px-2.5 py-3 text-center whitespace-nowrap">Progres</th>
                <th className="px-2.5 py-3 text-right whitespace-nowrap">Aksi / Navigasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Tidak ada data Sitelist yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry, idx) => (
                  <tr
                    key={entry.key}
                    className={`hover:bg-blue-50/30 transition ${
                      !entry.isProvisioned ? 'bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="px-2.5 py-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-2.5 py-2.5 font-mono font-semibold text-slate-700 whitespace-nowrap">
                      {entry.emrSiteCode}
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {entry.subfeederId}
                    </td>
                    <td className="px-2.5 py-2.5 font-mono font-semibold text-blue-700 whitespace-nowrap">
                      {entry.clusterId}
                    </td>
                    <td className="px-2.5 py-2.5 font-semibold text-slate-900">{entry.clusterName}</td>
                    <td className="px-2.5 py-2.5 font-extrabold text-slate-900 whitespace-nowrap">
                      {entry.shortName}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {entry.oltName}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          entry.kecamatan.toLowerCase() === 'kedungtuban'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {entry.kecamatan}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                      {entry.isProvisioned ? (
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              entry.percentage >= 100
                                ? 'bg-emerald-100 text-emerald-800'
                                : entry.percentage > 0
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {entry.percentage}%
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            CLR {entry.clrPercentage}% • SF {entry.sfPercentage}%
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Belum Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                      {entry.isProvisioned && entry.dbClusterId ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/daily-input?clusterId=${entry.dbClusterId}`}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-[11px] transition"
                          >
                            + Input
                          </Link>
                          <Link
                            href={`/matrix?clusterId=${entry.dbClusterId}`}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] transition"
                          >
                            Matriks
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEditClusterModal(entry)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition"
                            title="Edit Identitas Cluster / HP"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleActivateEntry(entry)}
                          disabled={activatingKey === entry.key}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition disabled:opacity-50"
                        >
                          {activatingKey === entry.key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PlusCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Aktifkan Cluster</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Tambah / Edit Cluster Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    {isEditingExisting ? 'Edit Data Sitelist Cluster' : 'Tambah Cluster Baru ke Sitelist'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Format kolom sesuai standar tabel Sitelist.xlsx (otomatis membuat item kerja 70:30)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Short Name (Nama Singkat) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formShortName}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setFormShortName(val);
                      if (!isEditingExisting && val) {
                        setFormClusterName(`KELURAHAN ${val} ${formKabupaten.toUpperCase()}`);
                      }
                    }}
                    placeholder="Contoh: BALUN / RANDUBLATUNG"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Kapasitas Home Passes (HP)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formHomePasses}
                    onChange={(e) => setFormHomePasses(e.target.value)}
                    placeholder="Contoh: 450"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Cluster Name (Nama Lengkap Kelurahan/Desa) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formClusterName}
                    onChange={(e) => setFormClusterName(e.target.value.toUpperCase())}
                    placeholder="Contoh: KELURAHAN BALUN BLORA"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">EMR Site Code</label>
                  <input
                    type="text"
                    value={formEmrSiteCode}
                    onChange={(e) => setFormEmrSiteCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: BLA000032"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cluster ID</label>
                  <input
                    type="text"
                    value={formClusterId}
                    onChange={(e) => setFormClusterId(e.target.value.toUpperCase())}
                    placeholder="Contoh: CLRM07-99-015"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subfeeder ID</label>
                  <input
                    type="text"
                    value={formSubfeederId}
                    onChange={(e) => setFormSubfeederId(e.target.value.toUpperCase())}
                    placeholder="Contoh: SFM07-99-015"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">OLT Name</label>
                  <input
                    type="text"
                    list="olt-options-list"
                    value={formOltName}
                    onChange={(e) => setFormOltName(e.target.value)}
                    placeholder="Contoh: OLT Balun"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="olt-options-list">
                    <option value="OLT Balun" />
                    <option value="OLT Kedungtuban" />
                    {oltList.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Kecamatan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="kecamatan-options-list"
                    value={formKecamatan}
                    onChange={(e) => setFormKecamatan(e.target.value)}
                    placeholder="Contoh: Kedungtuban / Cepu"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="kecamatan-options-list">
                    {kecamatanList.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Kabupaten <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="kabupaten-options-list"
                    value={formKabupaten}
                    onChange={(e) => setFormKabupaten(e.target.value)}
                    placeholder="Contoh: Blora"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="kabupaten-options-list">
                    {kabupatenList.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {submittingModal ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{isEditingExisting ? 'Simpan Perubahan' : 'Simpan & Aktifkan Cluster'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
