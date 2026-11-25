'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  SitelistEntry,
  RegionSummaryItem,
  ParsedSitelistImportRow,
  createOrActivateSitelistCluster,
  activateAllSitelistClusters,
  deactivateSitelistCluster,
  parseSitelistFile,
  commitSitelistImport,
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
  PowerOff,
  X,
  Check,
  HardHat,
  Cable,
  Box,
  Cpu,
  Upload,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

export default function SitelistClient({
  initialEntries,
  kabupatenSummaries,
  kabupatenList,
  oltList,
}: {
  initialEntries: SitelistEntry[];
  kecamatanSummaries?: RegionSummaryItem[];
  kabupatenSummaries: RegionSummaryItem[];
  kecamatanList?: string[];
  kabupatenList: string[];
  oltList: string[];
}) {
  const router = useRouter();

  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('ALL');
  const [selectedOlt, setSelectedOlt] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNPROVISIONED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'CLUSTER_SF' | 'MAIN_FEEDER'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action states
  const [activatingKey, setActivatingKey] = useState<string | null>(null);
  const [deactivatingKey, setDeactivatingKey] = useState<string | null>(null);
  const [activatingAll, setActivatingAll] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add / Edit New Cluster Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [isEditingExisting, setIsEditingExisting] = useState<boolean>(false);
  const [editingDbClusterId, setEditingDbClusterId] = useState<string | null>(null);
  const [submittingModal, setSubmittingModal] = useState<boolean>(false);
  const [formEmrSiteCode, setFormEmrSiteCode] = useState<string>('');
  const [formSubfeederId, setFormSubfeederId] = useState<string>('');
  const [formClusterId, setFormClusterId] = useState<string>('');
  const [formClusterName, setFormClusterName] = useState<string>('');
  const [formShortName, setFormShortName] = useState<string>('');
  const [formOltName, setFormOltName] = useState<string>('OLT Balun');
  const [formKecamatan, setFormKecamatan] = useState<string>('Kedungtuban');
  const [formKabupaten, setFormKabupaten] = useState<string>('Blora');
  const [formStartImpleDate, setFormStartImpleDate] = useState<string>('');
  const [formHomePasses, setFormHomePasses] = useState<string>('0');
  const [formProjectType, setFormProjectType] = useState<'CLUSTER_SF' | 'MAIN_FEEDER'>('CLUSTER_SF');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Import Excel / CSV Modal state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [parsingImport, setParsingImport] = useState<boolean>(false);
  const [committingImport, setCommittingImport] = useState<boolean>(false);
  const [importFilename, setImportFilename] = useState<string>('');
  const [importRows, setImportRows] = useState<ParsedSitelistImportRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSkippedCount, setImportSkippedCount] = useState<number>(0);
  const [importUpdateExisting, setImportUpdateExisting] = useState<boolean>(true);
  const [importDefaultKota, setImportDefaultKota] = useState<string>('Blora');

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const toDdMmmYyFromIso = (iso: string) => {
    const [yyyy, mm, dd] = iso.split('-');
    const mIdx = parseInt(mm, 10) - 1;
    if (!yyyy || isNaN(mIdx) || mIdx < 0 || mIdx > 11) return iso;
    return `${dd.padStart(2, '0')}-${MONTHS_SHORT[mIdx]}-${yyyy.slice(-2)}`;
  };

  // Filtered entries for table & dynamic KPI summary
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return initialEntries.filter((entry) => {
      if (selectedKabupaten !== 'ALL' && entry.kabupaten !== selectedKabupaten) return false;
      if (selectedOlt !== 'ALL' && entry.oltName !== selectedOlt) return false;
      if (statusFilter === 'ACTIVE' && !entry.isProvisioned) return false;
      if (statusFilter === 'UNPROVISIONED' && entry.isProvisioned) return false;
      if (categoryFilter !== 'ALL' && entry.projectType !== categoryFilter) return false;

      if (q) {
        const match =
          entry.shortName.toLowerCase().includes(q) ||
          entry.clusterName.toLowerCase().includes(q) ||
          entry.clusterId.toLowerCase().includes(q) ||
          entry.subfeederId.toLowerCase().includes(q) ||
          entry.emrSiteCode.toLowerCase().includes(q) ||
          entry.oltName.toLowerCase().includes(q) ||
          entry.kabupaten.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [initialEntries, selectedKabupaten, selectedOlt, statusFilter, categoryFilter, searchQuery]);

  // Dynamic KPI Summary for currently selected Kota filter
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
    setEditingDbClusterId(null);
    setFormEmrSiteCode('');
    setFormSubfeederId('');
    setFormClusterId('');
    setFormClusterName('');
    setFormShortName('');
    setFormOltName('OLT Balun');
    setFormKecamatan('Kedungtuban');
    setFormKabupaten(selectedKabupaten !== 'ALL' ? selectedKabupaten : 'Blora');
    setFormStartImpleDate('');
    setFormHomePasses('0');
    setFormProjectType('CLUSTER_SF');
    setFormIsActive(true);
    setShowAddModal(true);
  };

  const openEditClusterModal = (entry: SitelistEntry) => {
    setIsEditingExisting(entry.isProvisioned);
    setEditingDbClusterId(entry.dbClusterId);
    setFormEmrSiteCode(entry.emrSiteCode === '-' ? '' : entry.emrSiteCode);
    setFormSubfeederId(entry.subfeederId);
    setFormClusterId(entry.clusterId);
    setFormClusterName(entry.clusterName);
    setFormShortName(entry.shortName);
    setFormOltName(entry.oltName);
    setFormKecamatan(entry.kecamatan);
    setFormKabupaten(entry.kabupaten);
    setFormStartImpleDate(entry.startImpleDate || '');
    setFormHomePasses(String(entry.homePasses || 0));
    setFormProjectType(entry.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF');
    setFormIsActive(entry.isProvisioned);
    setShowAddModal(true);
  };

  const handleDeactivateEntry = async (entry: SitelistEntry) => {
    if (
      !confirm(
        `Ubah status cluster "${entry.shortName}" dari Aktif menjadi Belum Aktif?\n\nCluster akan dinonaktifkan dari Dashboard, Matriks & Input Harian.`
      )
    ) {
      return;
    }

    setDeactivatingKey(entry.key);
    setFeedback(null);
    const res = await deactivateSitelistCluster({
      dbClusterId: entry.dbClusterId,
      shortName: entry.shortName,
    });
    setDeactivatingKey(null);

    if (res.success) {
      setShowAddModal(false);
      setFeedback({
        type: 'success',
        text: res.message || `Status cluster "${entry.shortName}" berhasil diubah ke Belum Aktif!`,
      });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menonaktifkan cluster.' });
    }
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
      startImpleDate: entry.startImpleDate || '',
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
      selectedKabupaten !== 'ALL' ? `Kota ${selectedKabupaten}` : 'seluruh Sitelist';
    if (!confirm(`Aktifkan semua cluster yang belum terdaftar pada ${scopeLabel}?`)) return;

    setActivatingAll(true);
    setFeedback(null);
    const res = await activateAllSitelistClusters('ALL');
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
      dbClusterId: editingDbClusterId,
      emrSiteCode: formEmrSiteCode.trim() || '-',
      subfeederId: formSubfeederId.trim() || `SFM07-99-${shortClean}`,
      clusterId: formClusterId.trim() || `CLRM07-99-${shortClean}`,
      clusterName: formClusterName.trim().toUpperCase() || `KELURAHAN ${shortClean} ${formKabupaten.toUpperCase()}`,
      shortName: shortClean,
      oltName: formOltName.trim() || 'OLT Balun',
      kecamatan: formKecamatan.trim() || 'Kedungtuban',
      kabupaten: formKabupaten.trim() || 'Blora',
      startImpleDate: formStartImpleDate.trim(),
      homePasses: parseInt(formHomePasses, 10) || 0,
      projectType: formProjectType,
      isActive: isEditingExisting ? formIsActive : true,
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

  const openImportModal = () => {
    setImportFilename('');
    setImportRows([]);
    setImportError(null);
    setImportSkippedCount(0);
    setImportUpdateExisting(true);
    setImportDefaultKota(selectedKabupaten !== 'ALL' ? selectedKabupaten : 'Blora');
    setShowImportModal(true);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingImport(true);
    setImportError(null);
    setImportRows([]);
    setImportFilename(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string)?.split(',')[1] || '';
      const res = await parseSitelistFile(base64, file.name);
      setParsingImport(false);

      if (res.success && res.rows) {
        setImportRows(res.rows);
        setImportSkippedCount(res.skippedCount || 0);
      } else {
        setImportError(res.error || 'Gagal membaca file Excel / CSV.');
      }
    };
    reader.onerror = () => {
      setParsingImport(false);
      setImportError('Gagal membaca file dari perangkat.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDownloadCsvTemplate = () => {
    const csvLines = [
      'EMR Site Code,Subfeeder ID,Cluster ID,Cluster Name,Short Name,OLT Name,Kota,Start Imple Date,Home Passes,Kategori',
      'SMG000001,SFM01-01-001,CLRM01-01-001,KELURAHAN BANYUMANIK SEMARANG,BANYUMANIK,OLT Banyumanik,Semarang,01-Dec-26,650,CLUSTER_SF',
      'MF000001,MF-SMG-01,MF-SMG-01,MF BANYUMANIK TO TEMBALANG,MF_BNM_TO_TMG,OLT Banyumanik,Semarang,01-Dec-26,0,MAIN_FEEDER',
    ];
    const blob = new Blob(['\ufeff' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Template_Import_Sitelist_FiberOS.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCommitImport = async () => {
    if (importRows.length === 0) return;

    setCommittingImport(true);
    setImportError(null);
    const res = await commitSitelistImport({
      rows: importRows,
      updateExisting: importUpdateExisting,
      defaultKota: importDefaultKota,
    });
    setCommittingImport(false);

    if (res.success) {
      setShowImportModal(false);
      setFeedback({ type: 'success', text: res.message || 'Impor Sitelist berhasil!' });
      router.refresh();
    } else {
      setImportError(res.error || 'Gagal menyimpan data impor sitelist.');
    }
  };

  const displayedSummaries = kabupatenSummaries;

  const activeRegionLabel =
    selectedKabupaten !== 'ALL'
      ? `Kota ${selectedKabupaten}`
      : 'Semua Wilayah (Kota)';

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
            Daftar resmi EMR Site Code, Subfeeder ID, Cluster ID, OLT, serta ringkasan progres per Kota.
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
            onClick={openImportModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition"
          >
            <Upload className="w-4 h-4" />
            <span>Impor Excel / CSV</span>
          </button>

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

      {/* SECTION 1: Summary Selector (Per Kota) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>Summary Progres Wilayah (Per Kota)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik kartu Kota di bawah untuk memfilter ringkasan dan tabel Sitelist.
            </p>
          </div>
        </div>

        {/* Region Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card: Semua Wilayah */}
          <div
            onClick={() => {
              setSelectedKabupaten('ALL');
            }}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              selectedKabupaten === 'ALL'
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
                  {kabupatenList.length} Kota
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

          {/* Cards per Kota */}
          {displayedSummaries.map((reg) => {
            const isSelected = selectedKabupaten === reg.regionName;

            return (
              <div
                key={`${reg.regionType}-${reg.regionName}`}
                onClick={() => {
                  setSelectedKabupaten(
                    selectedKabupaten === reg.regionName ? 'ALL' : reg.regionName
                  );
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
                      Kota
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 mt-1">
                      Kota {reg.regionName}
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
              <span className="text-xs font-bold text-slate-700">Kota:</span>
              <select
                value={selectedKabupaten}
                onChange={(e) => setSelectedKabupaten(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua Kota</option>
                {kabupatenList.map((kota) => (
                  <option key={kota} value={kota}>
                    {kota}
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

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">Kategori:</span>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as 'ALL' | 'CLUSTER_SF' | 'MAIN_FEEDER')
                }
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua Kategori</option>
                <option value="CLUSTER_SF">
                  Cluster + SF ({initialEntries.filter((e) => e.projectType !== 'MAIN_FEEDER').length})
                </option>
                <option value="MAIN_FEEDER">
                  Main Feeder ({initialEntries.filter((e) => e.projectType === 'MAIN_FEEDER').length})
                </option>
              </select>
            </div>
          </div>

          <div className="relative w-full lg:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari EMR Code, Cluster ID, Nama, Kota..."
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
                <th className="px-2 py-3 text-center w-9">No</th>
                <th className="px-2 py-3 whitespace-nowrap">Subfeeder ID</th>
                <th className="px-2 py-3 whitespace-nowrap">Cluster ID</th>
                <th className="px-2 py-3 whitespace-nowrap">Short Name</th>
                <th className="px-2 py-3 whitespace-nowrap">OLT Name</th>
                <th className="px-2 py-3 text-center whitespace-nowrap">Start Imple Date</th>
                <th className="px-2 py-3 text-center whitespace-nowrap">Progres</th>
                <th className="px-2 py-3 text-right whitespace-nowrap">Aksi / Navigasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
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
                    <td className="px-2 py-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-2 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {entry.subfeederId}
                    </td>
                    <td className="px-2 py-2.5 font-mono font-semibold text-blue-700 whitespace-nowrap">
                      {entry.clusterId}
                    </td>
                    <td
                      className="px-2 py-2.5 font-extrabold text-slate-900 whitespace-nowrap"
                      title={`${entry.clusterName}${entry.emrSiteCode && entry.emrSiteCode !== '-' ? ` (${entry.emrSiteCode})` : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{entry.shortName}</span>
                        {entry.projectType === 'MAIN_FEEDER' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            MF 100%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {entry.oltName}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center whitespace-nowrap">
                      {entry.startImpleDate ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-semibold text-[11px]">
                          {entry.startImpleDate}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center whitespace-nowrap">
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
                            {entry.projectType === 'MAIN_FEEDER'
                              ? `Main Feeder 100%: ${entry.sfPercentage}%`
                              : `CLR ${entry.clrPercentage}% • SF ${entry.sfPercentage}%`}
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Belum Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
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
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition"
                            title="Edit Identitas & Status Cluster"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivateEntry(entry)}
                            disabled={deactivatingKey === entry.key}
                            className="p-1.5 text-slate-400 hover:text-amber-700 rounded-lg hover:bg-amber-50 transition disabled:opacity-50"
                            title="Ubah Status ke Belum Aktif (Nonaktifkan)"
                          >
                            {deactivatingKey === entry.key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                            ) : (
                              <PowerOff className="w-3.5 h-3.5" />
                            )}
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
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Tipe Pekerjaan / Proyek <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formProjectType}
                    onChange={(e) =>
                      setFormProjectType(
                        e.target.value === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF'
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CLUSTER_SF">🏙️ Cluster + Subfeeder (Bobot 70% Cluster + 30% Subfeeder)</option>
                    <option value="MAIN_FEEDER">🛰️ Pekerjaan Main Feeder (Bobot 100% Feeder, Tanpa Cluster)</option>
                  </select>
                </div>

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
                    Kota <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="kota-options-list"
                    value={formKabupaten}
                    onChange={(e) => setFormKabupaten(e.target.value)}
                    placeholder="Contoh: Blora"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="kota-options-list">
                    {kabupatenList.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Start Imple Date <span className="text-[10px] font-normal text-slate-400">(dd-mmm-yy — kosongkan untuk otomatis dari laporan pertama)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formStartImpleDate}
                      onChange={(e) => setFormStartImpleDate(e.target.value)}
                      placeholder="Contoh: 01-Nov-26"
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="date"
                      onChange={(e) => {
                        if (e.target.value) {
                          setFormStartImpleDate(toDdMmmYyFromIso(e.target.value));
                        }
                      }}
                      className="px-2.5 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Pilih tanggal dari kalender"
                    />
                  </div>
                </div>

                {isEditingExisting && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <label className="font-bold text-slate-700 block mb-1.5">
                      Status Cluster di Proyek
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFormIsActive(true)}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition ${
                          formIsActive
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Aktif di Proyek</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormIsActive(false)}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition ${
                          !formIsActive
                            ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <PowerOff className="w-4 h-4 text-amber-600" />
                        <span>Belum Aktif (Nonaktifkan)</span>
                      </button>
                    </div>
                    {!formIsActive && (
                      <p className="text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200 rounded-lg px-3 py-1.5 mt-2">
                        ⚠️ Klik <strong>Simpan Perubahan</strong> di bawah untuk mengubah status cluster <strong>{formShortName}</strong> kembali menjadi <strong>Belum Aktif</strong>.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
                <div>
                  {isEditingExisting && (
                    <button
                      type="button"
                      disabled={submittingModal}
                      onClick={() =>
                        handleDeactivateEntry({
                          key: editingDbClusterId || formShortName,
                          dbClusterId: editingDbClusterId,
                          isProvisioned: true,
                          emrSiteCode: formEmrSiteCode,
                          subfeederId: formSubfeederId,
                          clusterId: formClusterId,
                          clusterName: formClusterName,
                          shortName: formShortName,
                          oltName: formOltName,
                          kecamatan: formKecamatan,
                          kabupaten: formKabupaten,
                          startImpleDate: formStartImpleDate,
                          homePasses: parseInt(formHomePasses, 10) || 0,
                          projectType: formProjectType,
                          percentage: 0,
                          clrPercentage: 0,
                          sfPercentage: 0,
                          status: 'NOT_STARTED',
                          poleInstalled: 0,
                          poleBoq: 0,
                          cableInstalled: 0,
                          cableBoq: 0,
                          fatInstalled: 0,
                          fatBoq: 0,
                          fdtInstalled: 0,
                          fdtBoq: 0,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
                    >
                      <PowerOff className="w-3.5 h-3.5 text-amber-600" />
                      <span>Set Belum Aktif</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
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
                    className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 ${
                      isEditingExisting && !formIsActive
                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                    }`}
                  >
                    {submittingModal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : !formIsActive && isEditingExisting ? (
                      <PowerOff className="w-4 h-4" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {isEditingExisting
                        ? !formIsActive
                          ? 'Simpan (Ubah ke Belum Aktif)'
                          : 'Simpan Perubahan'
                        : 'Simpan & Aktifkan Cluster'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import Sitelist Excel / CSV */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Impor Master Sitelist dari Excel / CSV
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mendukung format .xlsx, .xls, dan .csv (pemisah koma atau titik koma).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              {importError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="md:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Pilih File Excel / CSV <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer transition shadow-sm">
                      {parsingImport ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span>{parsingImport ? 'Membaca File...' : 'Pilih File (.xlsx / .csv)'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportFileChange}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleDownloadCsvTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold transition"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Unduh Template CSV</span>
                    </button>
                    {importFilename && (
                      <span className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 truncate max-w-[220px]">
                        {importFilename}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Kota Default (Jika kolom Kota kosong)
                  </label>
                  <input
                    type="text"
                    value={importDefaultKota}
                    onChange={(e) => setImportDefaultKota(e.target.value)}
                    placeholder="Contoh: Blora / Semarang"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-blue-50/70 border border-blue-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                <strong className="text-blue-800">Kolom yang didukung:</strong>{' '}
                <code>Short Name</code> (wajib), <code>Cluster ID</code>, <code>Subfeeder ID</code>,{' '}
                <code>EMR Site Code</code>, <code>Cluster Name</code>, <code>OLT Name</code>,{' '}
                <code>Kota</code> (atau <code>Kabupaten</code>), <code>Start Imple Date</code>,{' '}
                <code>Home Passes</code> (<code>HP</code>), dan <code>Kategori</code> (<code>CLUSTER_SF</code> / <code>MAIN_FEEDER</code>).
              </div>

              {importRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-bold">
                        Total: {importRows.length} Site
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                        Baru: {importRows.filter((r) => !r.existsInDb).length}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
                        Sudah Ada: {importRows.filter((r) => r.existsInDb).length}
                      </span>
                      {importSkippedCount > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">
                          Baris kosong dilewati: {importSkippedCount}
                        </span>
                      )}
                    </div>

                    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={importUpdateExisting}
                        onChange={(e) => setImportUpdateExisting(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Perbarui metadata cluster yang sudah ada (BOQ &amp; progres aman)</span>
                    </label>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                          <tr>
                            <th className="px-2.5 py-2 text-center w-10">No</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">Status</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">Short Name</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">Cluster ID</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">Subfeeder ID</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">EMR Code</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">OLT Name</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">Kota</th>
                            <th className="px-2.5 py-2 text-right whitespace-nowrap">HP</th>
                            <th className="px-2.5 py-2 whitespace-nowrap">Kategori</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {importRows.map((row, i) => (
                            <tr key={`${row.shortName}-${i}`} className="hover:bg-slate-50">
                              <td className="px-2.5 py-1.5 text-center text-slate-400">{i + 1}</td>
                              <td className="px-2.5 py-1.5 whitespace-nowrap">
                                {row.existsInDb ? (
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      importUpdateExisting
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {importUpdateExisting ? 'Update' : 'Lewati'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Baru
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 font-extrabold text-slate-900 whitespace-nowrap">
                                {row.shortName}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono text-blue-700 whitespace-nowrap">
                                {row.clusterId}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono text-slate-600 whitespace-nowrap">
                                {row.subfeederId}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono text-slate-600 whitespace-nowrap">
                                {row.emrSiteCode}
                              </td>
                              <td className="px-2.5 py-1.5 whitespace-nowrap">{row.oltName}</td>
                              <td className="px-2.5 py-1.5 whitespace-nowrap font-semibold">
                                {row.kota || importDefaultKota.trim() || 'Blora'}
                              </td>
                              <td className="px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums">
                                {row.homePasses}
                              </td>
                              <td className="px-2.5 py-1.5 whitespace-nowrap">
                                {row.projectType === 'MAIN_FEEDER' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold text-[10px]">
                                    MF 100%
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                                    Cluster+SF
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={importRows.length === 0 || committingImport}
                onClick={handleCommitImport}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition disabled:opacity-50"
              >
                {committingImport ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>
                  {committingImport
                    ? 'Menyimpan...'
                    : `Impor ${importRows.length} Data ke Sitelist`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
