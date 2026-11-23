'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  parseBoqExcel,
  parseSampleBoqFile,
  commitBoqImport,
  checkBoqTargetCluster,
  type BoqImportScope,
  type BoqTargetCheckResult,
  ParsedBoqResult,
  ParsedBoqItem,
} from '@/actions/importBoq';
import boqReferenceList from '@/data/boq-list.json';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Check,
  FileText,
  Save,
  Table2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function ImportBoqClient() {
  const router = useRouter();
  const [parsing, setParsing] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [result, setResult] = useState<ParsedBoqResult | null>(null);
  const [clusterName, setClusterName] = useState<string>('');
  const [scope, setScope] = useState<BoqImportScope>('CLUSTER');
  const [homePasses, setHomePasses] = useState<string>('0');
  const [showAllRefItems, setShowAllRefItems] = useState<boolean>(false);
  const [showRefGuide, setShowRefGuide] = useState<boolean>(false);
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [targetCheck, setTargetCheck] = useState<BoqTargetCheckResult | null>(null);
  const [checkingTarget, setCheckingTarget] = useState<boolean>(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const trimmed = clusterName.trim();
    if (!result || !trimmed) {
      setTargetCheck(null);
      return;
    }

    let cancelled = false;
    setCheckingTarget(true);
    const timer = setTimeout(async () => {
      const check = await checkBoqTargetCluster(trimmed, scope);
      if (!cancelled) {
        setTargetCheck(check);
        setCheckingTarget(false);
        setConfirmOverwrite(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [result, clusterName, scope]);

  const applyParsedResult = (data: ParsedBoqResult) => {
    setResult(data);
    setClusterName(data.clusterName);
    setScope(data.scope || 'CLUSTER');
    setConfirmOverwrite(false);
    if (data.homePasses && data.homePasses > 0) {
      setHomePasses(String(data.homePasses));
    }
  };

  const handleScopeChange = (newScope: BoqImportScope) => {
    setScope(newScope);
    if (result) {
      const targetSheet =
        newScope === 'SUBFEEDER' || newScope === 'MAIN_FEEDER'
          ? result.subfeederSheet
          : result.clusterSheet;
      if (targetSheet && targetSheet.clusterName) {
        setClusterName(targetSheet.clusterName);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setMessage(null);
    setResult(null);
    setUploadedFilename(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const res = await parseBoqExcel(base64, file.name);
      setParsing(false);

      if (res.success && res.data) {
        applyParsedResult(res.data);
      } else {
        setMessage({ type: 'error', text: res.error || 'Gagal membaca file Excel' });
      }
    };
    reader.onerror = () => {
      setParsing(false);
      setMessage({ type: 'error', text: 'Gagal mengunggah file' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLoadSample = async (filename: string, preferredScope?: 'CLUSTER' | 'SUBFEEDER') => {
    setParsing(true);
    setMessage(null);
    setResult(null);
    setUploadedFilename(filename);

    const res = await parseSampleBoqFile(filename, preferredScope);
    setParsing(false);

    if (res.success && res.data) {
      applyParsedResult(res.data);
      setMessage({ type: 'success', text: `File contoh "${filename}" berhasil dibaca!` });
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal membaca file contoh' });
    }
  };

  // Active sheet data dynamically switches based on selected Scope:
  // CLUSTER -> sheet "BoQ NRO Cluster"
  // SUBFEEDER / MAIN_FEEDER -> sheet "BoQ NRO All Feeder"
  const activeSheetData = result
    ? (scope === 'SUBFEEDER' || scope === 'MAIN_FEEDER') && result.subfeederSheet
      ? result.subfeederSheet
      : scope === 'CLUSTER' && result.clusterSheet
      ? result.clusterSheet
      : {
          sheetName: result.sheetName,
          clusterName: result.clusterName,
          homePasses: result.homePasses || 0,
          totalItems: result.totalItems,
          hasActiveVolume: result.items.some((i) => i.quantity > 0),
          items: result.items,
          allReferenceItems: result.allReferenceItems,
        }
    : null;

  const displayedItems: ParsedBoqItem[] = activeSheetData
    ? showAllRefItems
      ? activeSheetData.allReferenceItems
      : activeSheetData.items
    : [];

  const hasOverwriteRisk = Boolean(
    targetCheck?.exists &&
      ((targetCheck.itemCountInScope || 0) > 0 ||
        scope === 'MAIN_FEEDER' ||
        targetCheck.projectType === 'MAIN_FEEDER')
  );

  const handleCommit = async () => {
    if (!activeSheetData || !clusterName.trim()) {
      setMessage({ type: 'error', text: 'Nama cluster harus diisi.' });
      return;
    }

    const latestCheck = await checkBoqTargetCluster(clusterName.trim(), scope);
    setTargetCheck(latestCheck);

    const needsConfirmation = Boolean(
      latestCheck.exists &&
        ((latestCheck.itemCountInScope || 0) > 0 ||
          scope === 'MAIN_FEEDER' ||
          latestCheck.projectType === 'MAIN_FEEDER')
    );

    let agreedOverwrite = false;
    if (needsConfirmation && !confirmOverwrite) {
      agreedOverwrite = confirm(
        `PERINGATAN: Target "${latestCheck.clusterName}" (${latestCheck.code || '-'}) SUDAH ADA di database!\n` +
          `Data saat ini: ${latestCheck.existingSummary || '-'}\n\n` +
          `Jika dilanjutkan, BOQ yang lama pada scope ${scope} akan TERTIMPA oleh file "${uploadedFilename || 'ini'}".\n\n` +
          `• Klik OK untuk MENIMPA data yang sudah ada.\n` +
          `• Klik Cancel jika ini link/cluster berbeda, lalu ubah "Nama Cluster Target" terlebih dahulu.`
      );
      if (!agreedOverwrite) {
        setMessage({
          type: 'error',
          text: `Penyimpanan dibatalkan agar tidak menimpa "${latestCheck.clusterName}". Ubah Nama Pekerjaan/Cluster Target jika ini data baru.`,
        });
        return;
      }
    }

    setCommitting(true);
    setMessage(null);

    const res = await commitBoqImport({
      clusterName: clusterName.trim(),
      scope,
      homePasses: parseInt(homePasses) || 0,
      items: activeSheetData.items,
      conflictMode:
        !latestCheck.exists || !needsConfirmation || confirmOverwrite || agreedOverwrite
          ? 'OVERWRITE'
          : 'CREATE_NEW_ONLY',
    });

    setCommitting(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message || 'Berhasil mengimpor BOQ' });
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal menyimpan BOQ' });
    }
  };

  const getCategoryBadgeStyle = (category: string) => {
    switch (category) {
      case 'POLE':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'CABLE':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'FAT':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'FDT':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'JC':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            Impor Master BOQ dari File Excel
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            BOQ Cluster diambil dari sheet{' '}
            <span className="font-semibold text-slate-700">&quot;BoQ NRO Cluster&quot;</span> dan BOQ Subfeeder diambil dari sheet{' '}
            <span className="font-semibold text-slate-700">&quot;BoQ NRO All Feeder&quot;</span> sesuai acuan{' '}
            <span className="font-semibold text-slate-700">BOQ-list.xlsx</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRefGuide(!showRefGuide)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-sm transition self-start sm:self-auto"
        >
          <Table2 className="w-4 h-4 text-blue-600" />
          <span>Tabel Acuan BOQ-list.xlsx ({boqReferenceList.length} Item)</span>
          {showRefGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Collapsible Reference Table (BOQ-list.xlsx) */}
      {showRefGuide && (
        <div className="bg-white rounded-2xl p-5 border border-blue-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Table2 className="w-4 h-4 text-blue-600" />
                Tabel Acuan Mapping Import BOQ (BOQ-list.xlsx)
              </h3>
              <p className="text-xs text-slate-500">
                Hanya baris pekerjaan di bawah ini yang diambil dari lembar kerja Excel APD dan dikonversi ke nama BOQ standar aplikasi.
              </p>
            </div>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold">
                <tr>
                  <th className="p-2.5 border-b border-r border-slate-200">Item Pekerjaan</th>
                  <th className="p-2.5 border-b border-r border-slate-200 w-44">BOQ</th>
                  <th className="p-2.5 border-b border-r border-slate-200 w-28">Kategori</th>
                  <th className="p-2.5 border-b border-slate-200 w-24 text-center">Satuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {boqReferenceList.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2 border-r border-slate-200 font-medium text-slate-900">
                      {row.itemPekerjaan.replace(/\s+Pole$/i, '')}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-bold text-slate-900">
                      {row.boq}
                    </td>
                    <td className="p-2 border-r border-slate-200">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryBadgeStyle(
                          row.kategori
                        )}`}
                      >
                        {row.kategori}
                      </span>
                    </td>
                    <td className="p-2 text-center text-slate-600">{row.satuan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Upload Box */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition text-center group">
          <div className="p-4 bg-blue-100/70 text-blue-600 rounded-full group-hover:scale-110 transition">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <span className="font-bold text-slate-800 text-base mt-3">
            Pilih File Excel BOQ (.xlsx / .xls)
          </span>
          <span className="text-xs text-slate-500 mt-1 max-w-md">
            Cluster mengambil dari sheet <strong className="text-slate-700">BoQ NRO Cluster</strong> • Subfeeder mengambil dari sheet <strong className="text-slate-700">BoQ NRO All Feeder</strong>.
          </span>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
            disabled={parsing}
          />
        </label>

        {parsing && (
          <div className="flex items-center justify-center gap-2 py-4 text-blue-600 font-semibold text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Menganalisis sheet BoQ NRO Cluster &amp; BoQ NRO All Feeder...</span>
          </div>
        )}

        {/* Quick Load Buttons from existing project files */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Atau muat contoh file yang sudah tersedia di proyek:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                handleLoadSample(
                  'BLA000190 KELURAHAN NGRAHO BLORA_BOQ_APD(CLUSTER).xlsx',
                  'CLUSTER'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Contoh BOQ APD Cluster (Sheet: BoQ NRO Cluster)
            </button>
            <button
              type="button"
              onClick={() =>
                handleLoadSample(
                  'BLA000190 SF-KELURAHAN NGRAHO BLORA_BOQ_APD(SUBFEEDER).xlsx',
                  'SUBFEEDER'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Contoh BOQ APD Subfeeder (Sheet: BoQ NRO All Feeder)
            </button>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {result && activeSheetData && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full mb-1">
                <Check className="w-3 h-3" /> Berhasil Membaca Lembar Kerja: {activeSheetData.sheetName}
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                Preview Data BOQ Terdeteksi ({displayedItems.length} item dari {activeSheetData.sheetName})
              </h2>
              {uploadedFilename && (
                <p className="text-xs text-slate-500 mt-0.5">
                  File sumber: <strong className="text-slate-700">{uploadedFilename}</strong>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllRefItems(!showAllRefItems)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {showAllRefItems
                  ? `Tampilkan Hanya Volume > 0 (${activeSheetData.items.length})`
                  : `Tampilkan Semua ${activeSheetData.allReferenceItems.length} Item Acuan`}
              </button>

              <button
                onClick={handleCommit}
                disabled={committing}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
              >
                {committing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Simpan ke Database</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Cluster details inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {scope === 'MAIN_FEEDER'
                  ? 'Nama Pekerjaan / Link Main Feeder'
                  : 'Nama Cluster Target'}
              </label>
              <input
                type="text"
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scope Pekerjaan &amp; Sheet Sumber
              </label>
              <select
                value={scope}
                onChange={(e) => handleScopeChange(e.target.value as BoqImportScope)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CLUSTER">
                  🏙️ Pekerjaan Cluster (Bobot 70% • Sheet: BoQ NRO Cluster)
                </option>
                <option value="SUBFEEDER">
                  📡 Pekerjaan Subfeeder (Bobot 30% • Sheet: BoQ NRO All Feeder)
                </option>
                <option value="MAIN_FEEDER">
                  🛣️ Pekerjaan Main Feeder (Bobot 100% Feeder • Sheet: BoQ NRO All Feeder)
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {scope === 'MAIN_FEEDER'
                  ? 'Kapasitas HP (Opsional • Non Cluster)'
                  : 'Kapasitas Home Passes (HP)'}
              </label>
              <input
                type="number"
                value={homePasses}
                onChange={(e) => setHomePasses(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Duplicate / Overwrite Warning Banner */}
          {checkingTarget ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>Memeriksa apakah nama target sudah ada di database...</span>
            </div>
          ) : targetCheck?.exists ? (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                hasOverwriteRisk
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    hasOverwriteRisk ? 'text-amber-600' : 'text-blue-600'
                  }`}
                />
                <div className="space-y-1">
                  <p className="font-bold">
                    {hasOverwriteRisk
                      ? `Peringatan Cegah Timpa: Target "${targetCheck.clusterName}" (${targetCheck.code || '-'}) sudah terdaftar!`
                      : `Info Target: "${targetCheck.clusterName}" (${targetCheck.code || '-'}) sudah ada di database.`}
                  </p>
                  <p>
                    Data tersimpan saat ini ({targetCheck.projectType === 'MAIN_FEEDER' ? 'Main Feeder' : 'Cluster + SF'}):{' '}
                    <strong>{targetCheck.existingSummary}</strong>.
                  </p>
                  {hasOverwriteRisk ? (
                    <p>
                      Jika file ini adalah segmen/link berbeda, <strong>ubah kolom Nama di atas</strong> supaya data lama tidak tertimpa.
                    </p>
                  ) : (
                    <p>
                      Scope <strong>{scope}</strong> belum memiliki data BOQ di cluster ini, jadi penyimpanan ini akan melengkapi cluster yang sudah ada.
                    </p>
                  )}
                </div>
              </div>

              {hasOverwriteRisk && (
                <label className="flex items-center gap-2 pt-1 font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmOverwrite}
                    onChange={(e) => setConfirmOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    Ya, saya memang ingin memperbarui / menimpa BOQ yang ada di &quot;{targetCheck.clusterName}&quot;
                  </span>
                </label>
              )}
            </div>
          ) : null}

          {/* Table Preview matching BOQ-list.xlsx */}
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3 border-b border-r border-slate-200 w-12 text-center">No</th>
                  <th className="p-3 border-b border-r border-slate-200">Item Pekerjaan</th>
                  <th className="p-3 border-b border-r border-slate-200 w-44">BOQ</th>
                  <th className="p-3 border-b border-r border-slate-200 w-28">Kategori</th>
                  <th className="p-3 border-b border-r border-slate-200 w-24 text-center">Satuan</th>
                  <th className="p-3 border-b border-slate-200 w-32 text-right">Volume BOQ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {displayedItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50 transition ${
                      item.quantity === 0 ? 'opacity-50 bg-slate-50/50' : ''
                    }`}
                  >
                    <td className="p-2.5 border-r border-slate-100 text-center text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="p-2.5 border-r border-slate-100 font-medium text-slate-900">
                      {item.sourceItemName}
                    </td>
                    <td className="p-2.5 border-r border-slate-100 font-bold text-slate-900">
                      {item.boqName}
                    </td>
                    <td className="p-2.5 border-r border-slate-100">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryBadgeStyle(
                          item.category
                        )}`}
                      >
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2.5 border-r border-slate-100 text-center text-slate-600">
                      {item.unit}
                    </td>
                    <td className="p-2.5 text-right font-extrabold text-blue-700">
                      {item.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
