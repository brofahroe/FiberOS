'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getClusterItemsForForm, submitDailyProgress, getExistingDailyReport, deleteDailyReportByDate } from '@/actions/dailyProgress';
import { compressImage } from '@/lib/imageCompression';
import { 
  Building2, 
  Calendar, 
  User, 
  Users, 
  Camera, 
  AlertCircle, 
  CheckCircle2, 
  Send, 
  Loader2, 
  HardHat, 
  Cable, 
  Box, 
  Cpu, 
  Layers,
  X,
  CloudSun,
  Trash2,
  Edit3
} from 'lucide-react';

interface ClusterOption {
  id: string;
  name: string;
  homePasses: number;
}

interface ItemState {
  id: string;
  scope: string;
  workType: string;
  category: string;
  subCategory?: string;
  weight: number;
  itemName: string;
  unit: string;
  boq: number;
  installed: number;
  remaining: number;
  status: string;
  todayQty: string;
}

export default function DailyInputClient({
  clusters,
  initialClusterId,
  initialDate,
}: {
  clusters: ClusterOption[];
  initialClusterId?: string;
  initialDate?: string;
}) {
  const router = useRouter();

  // Header form states
  const [selectedClusterId, setSelectedClusterId] = useState<string>(initialClusterId || clusters[0]?.id || '');
  const [reportDate, setReportDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    const today = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${today.getDate()}-${months[today.getMonth()]}-${today.getFullYear().toString().slice(-2)}`;
  });
  const [reporterName, setReporterName] = useState<string>('');
  const [teamName, setTeamName] = useState<string>('');
  const [weather, setWeather] = useState<string>('Cerah');
  const [notes, setNotes] = useState<string>('');

  // Items and photos
  const [items, setItems] = useState<ItemState[]>([]);
  const [activeScopeTab, setActiveScopeTab] = useState<'CLUSTER' | 'SUBFEEDER' | 'ALL'>('CLUSTER');
  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit / correction mode state
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [checkingReport, setCheckingReport] = useState<boolean>(false);
  const [deletingReport, setDeletingReport] = useState<boolean>(false);

  // Load reporter and team from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedReporter = localStorage.getItem('fiberos_reporter');
      const savedTeam = localStorage.getItem('fiberos_team');
      if (savedReporter) setReporterName(savedReporter);
      if (savedTeam) setTeamName(savedTeam);
    }
  }, []);

  // Fetch items whenever cluster changes
  useEffect(() => {
    if (!selectedClusterId) return;

    let isMounted = true;
    setLoadingItems(true);
    getClusterItemsForForm(selectedClusterId).then((res) => {
      if (!isMounted) return;
      if (res && res.items) {
        setItems(
          res.items.map((it: any) => ({
            id: it.id,
            scope: it.scope || 'CLUSTER',
            workType: it.workType || 'CW',
            category: it.category,
            subCategory: it.subCategory,
            weight: it.weight || 0,
            itemName: it.itemName,
            unit: it.unit,
            boq: it.boq,
            installed: it.installed,
            remaining: it.remaining,
            status: it.status || 'ONGOING',
            todayQty: '',
          }))
        );
      }
      setLoadingItems(false);
    });

    return () => {
      isMounted = false;
    };
  }, [selectedClusterId]);

  // Check if report already exists for selectedClusterId and reportDate
  useEffect(() => {
    if (!selectedClusterId || !reportDate) return;

    let isMounted = true;
    setCheckingReport(true);

    getExistingDailyReport(selectedClusterId, reportDate.trim()).then((res) => {
      if (!isMounted) return;
      setCheckingReport(false);

      if (res && res.exists && res.report) {
        setIsEditMode(true);
        if (res.report.reporterName) setReporterName(res.report.reporterName);
        if (res.report.teamName) setTeamName(res.report.teamName);
        if (res.report.weather) setWeather(res.report.weather);
        if (res.report.notes) setNotes(res.report.notes);
        if (res.report.photos && res.report.photos.length > 0) setPhotos(res.report.photos);

        const qtyMap = new Map<string, number>();
        res.report.items.forEach((it: any) => qtyMap.set(it.workItemId, it.quantity));

        setItems((prev) =>
          prev.map((it) => {
            const recorded = qtyMap.get(it.id);
            return {
              ...it,
              todayQty: recorded !== undefined && recorded > 0 ? String(recorded) : '',
            };
          })
        );
      } else {
        setIsEditMode(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedClusterId, reportDate]);

  const handleDeleteReport = async () => {
    const clusterName = clusters.find((c) => c.id === selectedClusterId)?.name || 'Cluster';
    if (!confirm(`Yakin ingin menghapus seluruh laporan progres untuk cluster "${clusterName}" pada tanggal "${reportDate}"?`)) {
      return;
    }

    setDeletingReport(true);
    const res = await deleteDailyReportByDate(selectedClusterId, reportDate.trim());
    setDeletingReport(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message || 'Laporan berhasil dihapus.' });
      setIsEditMode(false);
      setItems((prev) => prev.map((it) => ({ ...it, todayQty: '' })));
      setNotes('');
      setPhotos([]);
      router.refresh();
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal menghapus laporan.' });
    }
  };

  const handleQtyChange = (itemId: string, val: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, todayQty: val } : it))
    );
  };

  // Photo handling with auto-compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setCompressing(true);
    const newPhotos: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBase64 = await compressImage(files[i], 1280, 1280, 0.75);
        newPhotos.push(compressedBase64);
      } catch (err) {
        console.error('Failed to compress image:', err);
      }
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
    setCompressing(false);
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClusterId) {
      setMessage({ type: 'error', text: 'Pilih cluster terlebih dahulu.' });
      return;
    }

    // Filter items that have quantity > 0
    const itemsToSubmit = items
      .filter((it) => parseFloat(it.todayQty) > 0)
      .map((it) => ({
        workItemId: it.id,
        quantity: parseFloat(it.todayQty),
      }));

    if (itemsToSubmit.length === 0 && !notes && photos.length === 0) {
      setMessage({ type: 'error', text: 'Masukkan minimal satu volume progres item pekerjaan.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    // Save reporter to localStorage
    if (typeof window !== 'undefined') {
      if (reporterName) localStorage.setItem('fiberos_reporter', reporterName);
      if (teamName) localStorage.setItem('fiberos_team', teamName);
    }

    const res = await submitDailyProgress({
      clusterId: selectedClusterId,
      reportDate,
      reporterName,
      teamName,
      weather,
      notes,
      photoBase64List: photos,
      items: itemsToSubmit,
    });

    setSubmitting(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message || 'Laporan progres berhasil disimpan!' });
      // Clear todayQty and photos
      setItems((prev) => prev.map((it) => ({ ...it, todayQty: '' })));
      setPhotos([]);
      setNotes('');
      // Refresh after short delay
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal menyimpan progres.' });
    }
  };

  // Group items by category
  const categoriesList = [
    { key: 'POLE', label: 'Tiang (Poles)', icon: HardHat },
    { key: 'CABLE', label: 'Kabel Distribusi & Feeder', icon: Cable },
    { key: 'FAT', label: 'FAT (Fiber Access Terminal)', icon: Box },
    { key: 'FDT', label: 'FDT (Fiber Distribution Terminal)', icon: Cpu },
    { key: 'JC', label: 'Joint Closure (JC)', icon: Cpu },
    { key: 'ACCESSORY', label: 'Aksesoris & Perapihan', icon: Layers },
    { key: 'OTHER', label: 'Item Lainnya', icon: Layers },
  ];

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
      {/* Page Title & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Form Input Progres Harian
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Input hasil instalasi lapangan per cluster per hari dengan validasi BOQ otomatis.
          </p>
        </div>
      </div>

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

      {/* Section 1: Cluster & Report Info */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          1. Lokasi & Identitas Pelapor
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Cluster Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pilih Cluster <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedClusterId}
              onChange={(e) => setSelectedClusterId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              required
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.homePasses ? `(${c.homePasses} HP)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Report Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Pekerjaan <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                placeholder="Contoh: 12-Nov-26"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                required
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Reporter Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Pelapor / Pengawas
            </label>
            <div className="relative">
              <input
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="Contoh: Budi (Supervisor)"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Team / Vendor Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tim Pelaksana / Vendor
            </label>
            <div className="relative">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Contoh: Tim Tarik Kabel 1"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <Users className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Weather */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kondisi Cuaca Lapangan
            </label>
            <div className="flex gap-2">
              {['Cerah', 'Mendung', 'Hujan Ringan', 'Hujan Lebat / Stop Kerja'].map((w) => (
                <button
                  type="button"
                  key={w}
                  onClick={() => setWeather(w)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    weather === w
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Existing Report Found / Edit Mode Notice */}
        {checkingReport && (
          <div className="flex items-center gap-2 text-xs text-blue-600 font-medium py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Memeriksa riwayat laporan pada tanggal ini...</span>
          </div>
        )}

        {isEditMode && !checkingReport && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-xs sm:text-sm block text-amber-950">
                  Mode Koreksi / Edit Laporan Aktif
                </span>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Ditemukan laporan tersimpan untuk tanggal <strong>{reportDate}</strong>. Anda dapat mengoreksi volume pekerjaan di bawah, atau menghapus seluruh laporan jika terjadi salah input.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDeleteReport}
              disabled={deletingReport}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition shadow-sm"
            >
              {deletingReport ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Hapus Laporan Ini</span>
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Work Items Input (Grouped by Category) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <HardHat className="w-4 h-4 text-blue-600" />
              2. Volume Pekerjaan Hari Ini
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Isi hanya pada item yang dikerjakan hari ini. Angka akan otomatis divalidasi terhadap sisa target BOQ.
            </p>
          </div>

          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveScopeTab('CLUSTER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeScopeTab === 'CLUSTER'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏙️ Cluster (70%)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveScopeTab('SUBFEEDER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeScopeTab === 'SUBFEEDER'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📡 Subfeeder (30%)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveScopeTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeScopeTab === 'ALL'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Semua</span>
            </button>
          </div>
        </div>

        {loadingItems ? (
          <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm">Memuat item pekerjaan cluster...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            Tidak ada item pekerjaan terdaftar pada cluster ini.
          </div>
        ) : (
          <div className="space-y-6">
            {categoriesList.map((cat) => {
              const catItems = items.filter((it) => {
                const matchesScope = activeScopeTab === 'ALL' || it.scope === activeScopeTab;
                return matchesScope && it.category === cat.key;
              });
              if (catItems.length === 0) return null;

              const Icon = cat.icon;

              return (
                <div key={cat.key} className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-100/80 px-3 py-1.5 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-blue-600" />
                      <span>{cat.label}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      {activeScopeTab === 'SUBFEEDER' ? 'Scope Subfeeder' : activeScopeTab === 'CLUSTER' ? 'Scope Cluster' : 'Semua Scope'}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {catItems.map((item) => {
                      const todayVal = parseFloat(item.todayQty) || 0;
                      const isExceeding = todayVal > item.remaining && item.boq > 0;

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                            item.status === 'DONE'
                              ? 'bg-slate-50/80 opacity-80'
                              : 'bg-white hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${item.status === 'DONE' ? 'text-slate-600 line-through' : 'text-slate-900'}`}>
                                {item.itemName}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                {item.scope === 'SUBFEEDER' ? 'SF (30%)' : 'CLR (70%)'}
                              </span>
                              {item.status === 'DONE' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                  🔒 DONE (Terkunci)
                                </span>
                              )}
                              {item.status === 'HOLD' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                  ⏸️ HOLD (Ditunda)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span>
                                BOQ: <strong className="text-slate-700">{item.boq}</strong> {item.unit}
                              </span>
                              <span>•</span>
                              <span>
                                Terpasang: <strong className="text-slate-700">{item.installed}</strong> {item.unit}
                              </span>
                              <span>•</span>
                              <span className={item.remaining === 0 ? 'text-emerald-600 font-semibold' : ''}>
                                Sisa: <strong className="text-blue-600">{item.remaining}</strong> {item.unit}
                              </span>
                            </div>
                            {item.status === 'DONE' && (
                              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                                ✓ Item telah berstatus final (DONE). Penambahan volume tidak diizinkan.
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 sm:w-48">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                disabled={item.status === 'DONE'}
                                value={item.todayQty}
                                onChange={(e) => handleQtyChange(item.id, e.target.value)}
                                placeholder={item.status === 'DONE' ? 'Locked' : '0'}
                                className={`w-full text-right px-3 py-2 border rounded-xl text-sm font-bold focus:outline-none transition ${
                                  item.status === 'DONE'
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                    : isExceeding
                                    ? 'border-amber-400 bg-amber-50 text-slate-900 focus:ring-2 focus:ring-amber-400'
                                    : todayVal > 0
                                    ? 'border-blue-500 bg-blue-50/40 text-slate-900 focus:ring-2 focus:ring-blue-500'
                                    : 'border-slate-300 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-blue-500'
                                }`}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 w-10 text-left">
                              {item.unit}
                            </span>
                          </div>
                          {isExceeding && (
                            <div className="text-[11px] text-amber-600 font-medium sm:col-span-2 -mt-1 sm:hidden">
                              ⚠️ Melebihi sisa BOQ ({item.remaining} {item.unit})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Notes & Photo Documentation */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-600" />
          3. Catatan Kendala & Foto Dokumentasi
        </h2>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Catatan Lapangan / Kendala Pekerjaan
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Contoh: Penarikan kabel RT 02 terhambat izin pemangkasan pohon; tiang 3 batang ditunda menunggu izin PLN."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Upload Foto Dokumentasi (Otomatis Dikompres Hemat Kuota)
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl text-xs font-semibold text-slate-700 transition">
              <Camera className="w-4 h-4 text-blue-600" />
              <span>Ambil Foto / Pilih Gambar</span>
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={compressing}
              />
            </label>

            {compressing && (
              <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mengompres foto...</span>
              </div>
            )}
          </div>

          {/* Preview Photos */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
              {photos.map((photoUrl, idx) => (
                <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                  <img src={photoUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-rose-600 text-white rounded-full transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium text-sm transition"
        >
          Batal
        </button>

        <button
          type="submit"
          disabled={submitting || compressing}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 transition transform active:scale-95 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              {isEditMode ? <Edit3 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              <span>{isEditMode ? 'Simpan Koreksi Laporan' : 'Kirim Laporan Harian'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

