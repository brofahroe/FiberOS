'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getClusterItemsForForm, submitDailyProgress, getDailyReportTeams, getExistingDailyReport, deleteDailyReportByDate, renameDailyReportTeam, addMasterTeam } from '@/actions/dailyProgress';
import { compressImage } from '@/lib/imageCompression';
import { 
  Building2, 
  Calendar, 
  ChevronLeft,
  ChevronRight,
  User, 
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
  Trash2,
  Edit3,
  Pencil,
  MessageSquare
} from 'lucide-react';
import WhatsAppReportModal from '@/components/WhatsAppReportModal';
import { SearchableDropdown } from '@/components/SearchableDropdown/SearchableDropdown';
import { TeamSelectorDropdown, type PreviousTeamOption } from '@/components/TeamSelectorDropdown';
import type { TimPelaksanaOption } from '@/lib/timPelaksana';
import sitelistData from '@/data/sitelist.json';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const DAYS_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function formatDateDdMmmYy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mmm = MONTHS_SHORT[date.getMonth()];
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

function parseDdMmmYy(dateStr: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  const parts = trimmed.split('-');
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const day = parseInt(parts[0], 10);
    const monthIdx = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === parts[1].toLowerCase());
    const yearRaw = parseInt(parts[2], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (!isNaN(day) && monthIdx >= 0 && !isNaN(year)) {
      return new Date(year, monthIdx, day);
    }
  }
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(day) && monthIdx >= 0 && !isNaN(year)) {
      return new Date(year, monthIdx, day);
    }
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

interface ClusterOption {
  id: string;
  name: string;
  homePasses: number;
}

interface SiteOption {
  emrSiteCode: string;
  subfeederId: string;
  clusterId: string;
  clusterName: string;
  shortName: string;
  oltName: string;
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
  masterTeams = [],
  loggedInUserName = '',
  initialClusterId,
  initialDate,
  initialTeam,
}: {
  clusters: ClusterOption[];
  masterTeams?: TimPelaksanaOption[];
  loggedInUserName?: string;
  initialClusterId?: string;
  initialDate?: string;
  initialTeam?: string;
}) {
  const router = useRouter();

  // Header form states
  const [selectedClusterId, setSelectedClusterId] = useState<string>(initialClusterId || clusters[0]?.id || '');
  const [reportDate, setReportDate] = useState<string>(() => {
    if (initialDate) {
      return formatDateDdMmmYy(parseDdMmmYy(initialDate));
    }
    return formatDateDdMmmYy(new Date());
  });
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [pickerViewDate, setPickerViewDate] = useState<Date>(() =>
    initialDate ? parseDdMmmYy(initialDate) : new Date()
  );
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const reporterName = loggedInUserName;
  const [teamName, setTeamName] = useState<string>(initialTeam || '');
  const [masterTeamList, setMasterTeamList] = useState<TimPelaksanaOption[]>(masterTeams);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [previousTeams, setPreviousTeams] = useState<PreviousTeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState<boolean>(false);
  const [teamListError, setTeamListError] = useState<string | null>(null);
  const pendingAutoTeamRef = useRef<boolean>(!initialTeam);

  useEffect(() => {
    setMasterTeamList(masterTeams);
  }, [masterTeams]);

  const handleAddMasterTeam = async (input: { timPelaksana: string; subcon: string }) => {
    const res = await addMasterTeam(input);
    if (res.success && res.team) {
      const added = res.team;
      setMasterTeamList((prev) => {
        const exists = prev.some((t) => t.tim.toLowerCase() === added.tim.toLowerCase());
        return exists ? prev : [...prev, added];
      });
    }
    return res;
  };
  const [weather, setWeather] = useState<string>('Cerah');
  const [notes, setNotes] = useState<string>('');

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  const selectedDateObj = useMemo(() => parseDdMmmYy(reportDate), [reportDate]);

  const calendarDays = useMemo(() => {
    const year = pickerViewDate.getFullYear();
    const month = pickerViewDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
      });
    }
    return cells;
  }, [pickerViewDate]);

  const handleSelectDate = (date: Date) => {
    setReportDate(formatDateDdMmmYy(date));
    setPickerViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
    setShowDatePicker(false);
  };

  // Sitelist dropdown state (merge official sitelist with any custom DB clusters)
  const sitelistOptions: SiteOption[] = useMemo(() => {
    const baseSites: SiteOption[] = [...sitelistData.sites];
    for (const c of clusters) {
      const lower = c.name.trim().toLowerCase();
      const stripped = lower.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
      const exists = baseSites.some(
        (s) =>
          s.shortName.toLowerCase() === lower ||
          s.shortName.toLowerCase() === stripped ||
          s.clusterName.toLowerCase() === lower ||
          s.clusterId.toLowerCase() === lower
      );
      if (!exists) {
        baseSites.push({
          emrSiteCode: '-',
          subfeederId: `SF-${c.name.toUpperCase()}`,
          clusterId: c.id,
          clusterName: c.name.toUpperCase(),
          shortName: c.name.toUpperCase(),
          oltName: 'OLT Blora',
        });
      }
    }
    return baseSites;
  }, [clusters]);

  const [selectedSitelistOption, setSelectedSitelistOption] = useState<SiteOption | null>(null);

  // Map sitelist shortName / clusterName / id to database cluster
  const clusterMap = useMemo(() => {
    const map = new Map<string, ClusterOption>();
    clusters.forEach((c) => {
      const lower = c.name.trim().toLowerCase();
      const stripped = lower.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
      map.set(lower, c);
      map.set(stripped, c);
      map.set(c.id.toLowerCase(), c);
    });
    return map;
  }, [clusters]);

  const resolveSelectedClusterId = useCallback(
    (opt: SiteOption | null): string => {
      if (!opt) return '';
      const dbCluster =
        clusterMap.get(opt.shortName.toLowerCase()) ||
        clusterMap.get(opt.clusterName.toLowerCase()) ||
        clusterMap.get(opt.clusterId.toLowerCase());
      return dbCluster ? dbCluster.id : opt.clusterId;
    },
    [clusterMap]
  );

  // Helper to match a DB cluster to a SiteOption
  const findSiteOptionForCluster = useCallback(
    (dbCluster: ClusterOption): SiteOption | null => {
      const lower = dbCluster.name.trim().toLowerCase();
      const stripped = lower.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
      return (
        sitelistOptions.find(
          (s) =>
            s.shortName.toLowerCase() === lower ||
            s.shortName.toLowerCase() === stripped ||
            s.clusterName.toLowerCase() === lower ||
            s.clusterId.toLowerCase() === lower ||
            s.clusterId === dbCluster.id
        ) || null
      );
    },
    [sitelistOptions]
  );

  // Initialize sitelist selection once from initialClusterId or first cluster
  const hasInitializedSitelistRef = useRef<boolean>(false);
  useEffect(() => {
    if (hasInitializedSitelistRef.current) return;
    if (initialClusterId) {
      const dbCluster = clusters.find((c) => c.id === initialClusterId);
      if (dbCluster) {
        const sitelistOpt = findSiteOptionForCluster(dbCluster);
        if (sitelistOpt) {
          setSelectedSitelistOption(sitelistOpt);
          hasInitializedSitelistRef.current = true;
        }
      }
    } else if (clusters[0] && !selectedSitelistOption) {
      const sitelistOpt = findSiteOptionForCluster(clusters[0]);
      if (sitelistOpt) {
        setSelectedSitelistOption(sitelistOpt);
        hasInitializedSitelistRef.current = true;
      }
    }
  }, [initialClusterId, clusters, findSiteOptionForCluster, selectedSitelistOption]);

  // Sync sitelist selection to selectedClusterId
  useEffect(() => {
    if (selectedSitelistOption) {
      setSelectedClusterId(resolveSelectedClusterId(selectedSitelistOption));
    }
  }, [selectedSitelistOption, resolveSelectedClusterId]);

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
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [showInlineRename, setShowInlineRename] = useState<boolean>(false);
  const [renameTeamInput, setRenameTeamInput] = useState<string>('');
  const [renamingTeam, setRenamingTeam] = useState<boolean>(false);
  const [checkingReport, setCheckingReport] = useState<boolean>(false);
  const [reportLookupError, setReportLookupError] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState<boolean>(false);
  const [showWaModal, setShowWaModal] = useState<boolean>(false);

  // Fetch items whenever cluster changes
  useEffect(() => {
    if (!selectedClusterId) return;

    let isMounted = true;
    setLoadingItems(true);
    getClusterItemsForForm(selectedClusterId).then((res) => {
      if (!isMounted) return;
      if (res && res.cluster && res.cluster.id !== selectedClusterId) {
        setSelectedClusterId(res.cluster.id);
      }
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

  // Load team names reported on this date & previous days for the selected cluster
  useEffect(() => {
    if (!selectedClusterId || !reportDate.trim()) {
      setAvailableTeams([]);
      setPreviousTeams([]);
      setLoadingTeams(false);
      setTeamListError(null);
      return;
    }

    if (loadingItems) {
      setLoadingTeams(true);
      return;
    }

    let isMounted = true;
    setLoadingTeams(true);
    setAvailableTeams([]);
    setPreviousTeams([]);
    setTeamListError(null);
    getDailyReportTeams(selectedClusterId, reportDate.trim()).then((res) => {
      if (!isMounted) return;
      setLoadingTeams(false);
      if (res.success) {
        const nextTeams = res.teams || [];
        const nextPrevious = res.previousTeams || [];
        setAvailableTeams(nextTeams);
        setPreviousTeams(nextPrevious);

        if (pendingAutoTeamRef.current) {
          pendingAutoTeamRef.current = false;
          setTeamName(nextTeams[0] || nextPrevious[0]?.teamName || '');
        } else if (nextTeams.length > 0) {
          setTeamName((prev) => (prev.trim() ? prev : nextTeams[0]));
        }
      } else {
        setTeamListError(res.error || 'Gagal memuat daftar tim.');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedClusterId, reportDate, loadingItems]);

  // Check if a report already exists for the selected cluster, date, and team
  useEffect(() => {
    if (loadingItems) {
      setCheckingReport(true);
      return;
    }

    if (!selectedClusterId || !reportDate.trim() || !teamName.trim()) {
      setCheckingReport(false);
      setReportLookupError(null);
      setMessage(null);
      setIsEditMode(false);
      setEditingReportId(null);
      setShowInlineRename(false);
      setItems((prev) => prev.map((it) => ({ ...it, todayQty: '' })));
      setPhotos([]);
      setNotes('');
      return;
    }

    let isMounted = true;
    setCheckingReport(true);
    setReportLookupError(null);
    setMessage(null);
    setIsEditMode(false);
    setEditingReportId(null);
    setShowInlineRename(false);
    setWeather('Cerah');
    setNotes('');
    setPhotos([]);
    setItems((prev) => prev.map((it) => ({ ...it, todayQty: '' })));

    getExistingDailyReport(selectedClusterId, reportDate.trim(), teamName.trim()).then((res) => {
      if (!isMounted) return;
      setCheckingReport(false);

      if ('error' in res && res.error) {
        setReportLookupError(res.error);
        setMessage({ type: 'error', text: res.error });
        return;
      }

      if (res && res.exists && res.report) {
        setIsEditMode(true);
        setEditingReportId(res.report.id);
        setRenameTeamInput(res.report.teamName);
        setTeamName(res.report.teamName);
        setWeather(res.report.weather);
        setNotes(res.report.notes);
        setPhotos(res.report.photos);

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
        setEditingReportId(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedClusterId, reportDate, teamName, loadingItems]);

  const handleRenameCurrentReportTeam = async () => {
    if (!editingReportId) return;
    const trimmed = renameTeamInput.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Nama Tim Pelaksana baru wajib diisi.' });
      return;
    }
    if (trimmed === teamName.trim()) {
      setShowInlineRename(false);
      return;
    }

    setRenamingTeam(true);
    setMessage(null);
    const oldTeam = teamName.trim();
    const res = await renameDailyReportTeam({
      reportId: editingReportId,
      newTeamName: trimmed,
      scope: 'SINGLE',
    });
    setRenamingTeam(false);

    if (res.success) {
      setShowInlineRename(false);
      setAvailableTeams((prev) => {
        const next = prev.map((t) => (t === oldTeam ? trimmed : t));
        return next.includes(trimmed) ? next : [...next, trimmed];
      });
      setTeamName(trimmed);
      if (typeof window !== 'undefined') {
        localStorage.setItem('fiberos_team', trimmed);
      }
      setMessage({ type: 'success', text: res.message || `Nama tim berhasil diubah menjadi "${trimmed}".` });
      router.refresh();
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal mengubah nama tim.' });
    }
  };

  const handleDeleteReport = async () => {
    const clusterName = clusters.find((c) => c.id === selectedClusterId)?.name || 'Cluster';
    if (!confirm(`Yakin ingin menghapus laporan progres tim "${teamName}" untuk cluster "${clusterName}" pada tanggal "${reportDate}"?`)) {
      return;
    }

    setDeletingReport(true);
    const res = await deleteDailyReportByDate(selectedClusterId, reportDate.trim(), teamName.trim());
    setDeletingReport(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message || 'Laporan berhasil dihapus.' });
      setIsEditMode(false);
      setAvailableTeams((prev) => prev.filter((team) => team !== teamName.trim()));
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
    if (!teamName.trim()) {
      setMessage({ type: 'error', text: 'Nama Tim Pelaksana wajib diisi.' });
      return;
    }
    if (reportLookupError) {
      setMessage({ type: 'error', text: reportLookupError });
      return;
    }

    // Filter items that have quantity > 0
    const itemsToSubmit = items
      .filter((it) => isEditMode || parseFloat(it.todayQty) > 0)
      .map((it) => ({
        workItemId: it.id,
        quantity: parseFloat(it.todayQty) || 0,
      }));

    if (itemsToSubmit.length === 0 && !notes && photos.length === 0) {
      setMessage({ type: 'error', text: 'Masukkan minimal satu volume progres item pekerjaan.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

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
    { key: 'SELING', label: 'Seling / Strand Wire', icon: Layers },
    { key: 'ACCESSORY', label: 'Aksesoris & Perapihan', icon: Layers },
    { key: 'OTHER', label: 'Item Lainnya', icon: Layers },
  ];

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
      {/* Page Title & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Form Input Progres Harian
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Input hasil instalasi lapangan per cluster per hari dengan validasi BOQ otomatis.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowWaModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 transition transform active:scale-95 self-start sm:self-auto"
        >
          <MessageSquare className="w-4 h-4" />
          <span>📲 Format Laporan WA</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>

          {message.type === 'success' && (
            <button
              type="button"
              onClick={() => setShowWaModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm self-start sm:self-auto"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Salin Format WA</span>
            </button>
          )}
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
            <SearchableDropdown
              options={sitelistOptions}
              value={selectedSitelistOption}
              onChange={(opt) => {
                pendingAutoTeamRef.current = true;
                setTeamName('');
                setSelectedSitelistOption(opt);
              }}
              label="Pilih Cluster"
              required
              placeholder="Ketik nama cluster..."
            />
          </div>

          {/* Report Date (dd-mmm-yy with Date Picker) */}
          <div ref={datePickerRef} className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Pekerjaan <span className="text-rose-500">*</span>
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">(dd-mmm-yy)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={reportDate}
                onClick={() => {
                  setPickerViewDate(parseDdMmmYy(reportDate));
                  setShowDatePicker((prev) => !prev);
                }}
                placeholder="Contoh: 15-Nov-26"
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 hover:bg-slate-100/80 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                required
              />
              <button
                type="button"
                onClick={() => {
                  setPickerViewDate(parseDdMmmYy(reportDate));
                  setShowDatePicker((prev) => !prev);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                title="Pilih Tanggal dari Kalender"
              >
                <Calendar className="w-4 h-4" />
              </button>
            </div>

            {showDatePicker && (
              <div className="absolute right-0 sm:left-0 z-50 mt-2 w-72 sm:w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
                {/* Month & Year Navigation Header */}
                <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() =>
                      setPickerViewDate(
                        new Date(pickerViewDate.getFullYear(), pickerViewDate.getMonth() - 1, 1)
                      )
                    }
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-600 transition"
                    title="Bulan Sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    <select
                      value={pickerViewDate.getMonth()}
                      onChange={(e) =>
                        setPickerViewDate(
                          new Date(pickerViewDate.getFullYear(), parseInt(e.target.value, 10), 1)
                        )
                      }
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {MONTHS_FULL_ID.map((mName, idx) => (
                        <option key={mName} value={idx}>
                          {mName}
                        </option>
                      ))}
                    </select>

                    <select
                      value={pickerViewDate.getFullYear()}
                      onChange={(e) =>
                        setPickerViewDate(
                          new Date(parseInt(e.target.value, 10), pickerViewDate.getMonth(), 1)
                        )
                      }
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPickerViewDate(
                        new Date(pickerViewDate.getFullYear(), pickerViewDate.getMonth() + 1, 1)
                      )
                    }
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-600 transition"
                    title="Bulan Berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Days of Week Header */}
                <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
                  {DAYS_SHORT_ID.map((dName, i) => (
                    <span
                      key={dName}
                      className={`text-[10px] font-extrabold uppercase ${
                        i === 0 ? 'text-rose-500' : 'text-slate-400'
                      }`}
                    >
                      {dName}
                    </span>
                  ))}
                </div>

                {/* Calendar Dates Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((cell, idx) => {
                    const cellStr = formatDateDdMmmYy(cell.date);
                    const isSelected =
                      cell.date.getDate() === selectedDateObj.getDate() &&
                      cell.date.getMonth() === selectedDateObj.getMonth() &&
                      cell.date.getFullYear() === selectedDateObj.getFullYear();

                    const today = new Date();
                    const isToday =
                      cell.date.getDate() === today.getDate() &&
                      cell.date.getMonth() === today.getMonth() &&
                      cell.date.getFullYear() === today.getFullYear();

                    return (
                      <button
                        key={`${cellStr}-${idx}`}
                        type="button"
                        onClick={() => handleSelectDate(cell.date)}
                        className={`h-8 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                            : isToday
                            ? 'bg-blue-50 text-blue-700 border border-blue-300'
                            : cell.isCurrentMonth
                            ? 'text-slate-700 hover:bg-slate-100'
                            : 'text-slate-300 hover:bg-slate-50'
                        }`}
                        title={cellStr}
                      >
                        {cell.date.getDate()}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Footer Actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectDate(new Date())}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold transition"
                    >
                      Hari Ini ({formatDateDdMmmYy(new Date())})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const yest = new Date();
                        yest.setDate(yest.getDate() - 1);
                        handleSelectDate(yest);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition"
                    >
                      Kemarin
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reporter Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Pelapor / Pengawas
              <span className="ml-1.5 text-[10px] font-normal text-blue-600">
                (Sesuai akun login)
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={reporterName}
                placeholder="Nama pengawas sesuai akun login"
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-100 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 cursor-not-allowed focus:outline-none"
              />
              <User className="w-4 h-4 text-blue-500 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Team / Vendor Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tim Pelaksana / Vendor <span className="text-rose-500">*</span>
            </label>
            <TeamSelectorDropdown
              value={teamName}
              onChange={setTeamName}
              teamsOnDate={availableTeams}
              previousTeams={previousTeams}
              masterTeams={masterTeamList}
              onAddTeam={handleAddMasterTeam}
              loadingTeams={loadingTeams}
              error={teamListError}
            />
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
            <span>Memeriksa laporan cluster, tanggal, dan tim...</span>
          </div>
        )}

        {isEditMode && !checkingReport && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 text-amber-900 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-xs sm:text-sm block text-amber-950">
                    Mode Koreksi / Edit Laporan Aktif
                  </span>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Ditemukan laporan tim <strong>{teamName}</strong> untuk tanggal <strong>{reportDate}</strong>. Anda dapat mengoreksi volume pekerjaan di bawah, mengganti nama tim, atau menghapus laporan tim ini.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {editingReportId && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameTeamInput(teamName);
                      setShowInlineRename((prev) => !prev);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Ubah Nama Tim</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDeleteReport}
                  disabled={deletingReport}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  {deletingReport ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Hapus Laporan Ini</span>
                </button>
              </div>
            </div>

            {showInlineRename && editingReportId && (
              <div className="pt-3 border-t border-amber-200/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={renameTeamInput}
                  onChange={(e) => setRenameTeamInput(e.target.value)}
                  list="tim-pelaksana-rename-list"
                  placeholder="Masukkan nama tim baru..."
                  className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="tim-pelaksana-rename-list">
                  {masterTeamList.map((mt) => (
                    <option key={mt.tim} value={mt.tim} />
                  ))}
                </datalist>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={renamingTeam}
                    onClick={handleRenameCurrentReportTeam}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-60"
                  >
                    {renamingTeam && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Simpan Nama Tim</span>
                  </button>
                  <button
                    type="button"
                    disabled={renamingTeam}
                    onClick={() => setShowInlineRename(false)}
                    className="px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold transition"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
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
                return matchesScope && (it.category || '').toUpperCase() === cat.key;
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
          disabled={submitting || compressing || checkingReport || Boolean(reportLookupError)}
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

      <WhatsAppReportModal
        isOpen={showWaModal}
        onClose={() => setShowWaModal(false)}
        clusterId={selectedClusterId}
        reportDate={reportDate}
      />
    </form>
  );
}

