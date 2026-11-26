'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers,
  PlusCircle,
  FileSpreadsheet,
  Building2,
  Edit3,
  Trash2,
  Plus,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';
import {
  updateClusterWorkItem,
  addClusterWorkItem,
  deleteClusterWorkItem,
  type WorkItemScope,
} from '@/actions/clusters';

export interface ClusterWorkItemView {
  id: string;
  itemName: string;
  scope: string;
  category: string;
  unit: string;
  boq: number;
  installed: number;
  remaining: number;
  percentage: number;
  status: string;
}

export interface ClusterBoqView {
  id: string;
  name: string;
  homePasses: number;
  projectType: 'CLUSTER_SF' | 'MAIN_FEEDER';
  totalWeightedPercentage: number;
  clrPercentage: number;
  sfPercentage: number;
  items: ClusterWorkItemView[];
}

const STANDARD_ITEM_GROUPS = [
  {
    group: 'Tiang (Pole)',
    options: [
      { value: 'Pole 7m "2.5"', label: 'Pole 7m "2.5" (Btg)', unit: 'Btg' },
      { value: 'Pole 7m "3"', label: 'Pole 7m "3" (Btg)', unit: 'Btg' },
      { value: 'Pole 7m "4"', label: 'Pole 7m "4" (Btg)', unit: 'Btg' },
      { value: 'Pole 9m "4"', label: 'Pole 9m "4" (Btg)', unit: 'Btg' },
    ],
  },
  {
    group: 'Kabel Fiber Optic',
    options: [
      { value: 'Kabel 24c', label: 'Kabel 24c (Meter)', unit: 'Meter' },
      { value: 'Kabel 36c', label: 'Kabel 36c (Meter)', unit: 'Meter' },
      { value: 'Kabel 48c', label: 'Kabel 48c (Meter)', unit: 'Meter' },
      { value: 'Kabel 96c', label: 'Kabel 96c (Meter — SF/MF)', unit: 'Meter' },
      { value: 'Kabel 144c', label: 'Kabel 144c (Meter — SF/MF)', unit: 'Meter' },
      { value: 'Kabel 288c', label: 'Kabel 288c (Meter — SF/MF)', unit: 'Meter' },
    ],
  },
  {
    group: 'Perangkat Terminasi & Closure',
    options: [
      { value: 'FAT', label: 'FAT (Pcs)', unit: 'Pcs' },
      { value: 'FDT48', label: 'FDT48 (Pcs)', unit: 'Pcs' },
      { value: 'FDT72', label: 'FDT72 (Pcs)', unit: 'Pcs' },
      { value: 'FDT', label: 'FDT (Pcs)', unit: 'Pcs' },
      { value: 'Joint Closure (JC)', label: 'Joint Closure (JC) (Pcs)', unit: 'Pcs' },
    ],
  },
  {
    group: 'Aksesoris / Seling',
    options: [{ value: 'Seling', label: 'Seling / Strand Wire (Meter)', unit: 'Meter' }],
  },
];

const ALL_STANDARD_VALUES = new Set(
  STANDARD_ITEM_GROUPS.flatMap((g) => g.options.map((o) => o.value))
);

const SUBFEEDER_ONLY_SET = new Set(['kabel 96c', 'kabel 144c', 'kabel 288c']);

export default function ClustersBoqClient({
  initialClusters,
  canEdit = true,
  canCreateInput = true,
  canViewMatrix = true,
}: {
  initialClusters: ClusterBoqView[];
  canEdit?: boolean;
  canCreateInput?: boolean;
  canViewMatrix?: boolean;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CLUSTER_SF' | 'MAIN_FEEDER'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal state (Add / Edit BOQ WorkItem)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'EDIT' | 'ADD'>('EDIT');
  const [targetCluster, setTargetCluster] = useState<ClusterBoqView | null>(null);
  const [editingItem, setEditingItem] = useState<ClusterWorkItemView | null>(null);
  const [selectedStandardName, setSelectedStandardName] = useState<string>('Pole 7m "3"');
  const [customItemName, setCustomItemName] = useState<string>('');
  const [formScope, setFormScope] = useState<WorkItemScope>('CLUSTER');
  const [formBoq, setFormBoq] = useState<string>('0');
  const [saving, setSaving] = useState(false);

  const filteredClusters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return initialClusters.filter((c) => {
      if (typeFilter !== 'ALL' && c.projectType !== typeFilter) return false;
      if (!q) return true;
      const nameMatch = c.name.toLowerCase().includes(q);
      const itemMatch = c.items.some((it) => it.itemName.toLowerCase().includes(q));
      return nameMatch || itemMatch;
    });
  }, [initialClusters, searchQuery, typeFilter]);

  const clusterOnlyList = useMemo(
    () => filteredClusters.filter((c) => c.projectType !== 'MAIN_FEEDER'),
    [filteredClusters]
  );

  const mainFeederOnlyList = useMemo(
    () => filteredClusters.filter((c) => c.projectType === 'MAIN_FEEDER'),
    [filteredClusters]
  );

  const totalCounts = useMemo(() => {
    const mf = initialClusters.filter((c) => c.projectType === 'MAIN_FEEDER').length;
    return {
      clusterCount: initialClusters.length - mf,
      mainFeederCount: mf,
    };
  }, [initialClusters]);

  const effectiveItemName =
    selectedStandardName === '__CUSTOM__' ? customItemName.trim() : selectedStandardName;

  const effectiveScope: WorkItemScope = useMemo(() => {
    if (targetCluster?.projectType === 'MAIN_FEEDER') return 'MAIN_FEEDER';
    if (formScope === 'CLUSTER' && SUBFEEDER_ONLY_SET.has(effectiveItemName.toLowerCase())) {
      return 'SUBFEEDER';
    }
    return formScope;
  }, [targetCluster, formScope, effectiveItemName]);

  const conflictingExistingItem = useMemo(() => {
    if (!targetCluster || !effectiveItemName) return null;
    const found = targetCluster.items.find(
      (it) =>
        it.itemName.toLowerCase() === effectiveItemName.toLowerCase() &&
        it.scope === effectiveScope &&
        (!editingItem || it.id !== editingItem.id)
    );
    return found || null;
  }, [targetCluster, effectiveItemName, effectiveScope, editingItem]);

  const openEditModal = (cluster: ClusterBoqView, item: ClusterWorkItemView) => {
    setTargetCluster(cluster);
    setEditingItem(item);
    setModalMode('EDIT');

    if (ALL_STANDARD_VALUES.has(item.itemName)) {
      setSelectedStandardName(item.itemName);
      setCustomItemName('');
    } else {
      setSelectedStandardName('__CUSTOM__');
      setCustomItemName(item.itemName);
    }

    const itemScope: WorkItemScope =
      cluster.projectType === 'MAIN_FEEDER'
        ? 'MAIN_FEEDER'
        : item.scope === 'SUBFEEDER'
        ? 'SUBFEEDER'
        : item.scope === 'MAIN_FEEDER'
        ? 'MAIN_FEEDER'
        : 'CLUSTER';
    setFormScope(itemScope);
    setFormBoq(String(item.boq));
    setModalOpen(true);
  };

  const openAddModal = (cluster: ClusterBoqView) => {
    setTargetCluster(cluster);
    setEditingItem(null);
    setModalMode('ADD');
    setSelectedStandardName(cluster.projectType === 'MAIN_FEEDER' ? 'Pole 7m "4"' : 'Pole 7m "3"');
    setCustomItemName('');
    setFormScope(cluster.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER');
    setFormBoq('0');
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCluster || !effectiveItemName) return;

    const boqNum = parseFloat(formBoq);
    if (isNaN(boqNum) || boqNum < 0) {
      setFeedback({ type: 'error', text: 'Target BOQ harus berupa angka >= 0.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    const res =
      modalMode === 'EDIT' && editingItem
        ? await updateClusterWorkItem({
            workItemId: editingItem.id,
            itemName: effectiveItemName,
            scope: effectiveScope,
            boq: boqNum,
          })
        : await addClusterWorkItem({
            clusterId: targetCluster.id,
            itemName: effectiveItemName,
            scope: effectiveScope,
            boq: boqNum,
          });

    setSaving(false);

    if (res.success) {
      setModalOpen(false);
      setFeedback({ type: 'success', text: res.message || 'Item BOQ berhasil diperbarui.' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menyimpan item BOQ.' });
    }
  };

  const handleDeleteItem = async (cluster: ClusterBoqView, item: ClusterWorkItemView) => {
    const hasProgress = item.installed > 0;
    const msg = hasProgress
      ? `PERHATIAN: Item "${item.itemName}" pada ${cluster.name} sudah memiliki realisasi TERPASANG ${item.installed.toLocaleString('en-US')} ${item.unit}.\n\nJika hanya salah jenis kabel/pole, sebaiknya gunakan tombol EDIT agar realisasi tidak hilang.\n\nApakah Anda yakin ingin MENGHAPUS item ini beserta riwayat input hariannya?`
      : `Hapus item "${item.itemName}" (BOQ: ${item.boq.toLocaleString('en-US')}) dari ${cluster.name}?`;

    if (!confirm(msg)) return;

    setDeletingId(item.id);
    setFeedback(null);
    const res = await deleteClusterWorkItem({
      workItemId: item.id,
      force: hasProgress,
    });
    setDeletingId(null);

    if (res.success) {
      setFeedback({ type: 'success', text: res.message || 'Item BOQ dihapus.' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menghapus item BOQ.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" />
            Master Cluster &amp; BOQ
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola target BOQ, ubah atau pindahkan jenis kabel/pole yang salah input, atau tambah item pekerjaan baru.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/import-boq"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            + Impor BOQ Baru
          </Link>
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

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama cluster / Main Feeder atau item pekerjaan (misal: Kabel 96c, Pole)..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              typeFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({initialClusters.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('CLUSTER_SF')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              typeFilter === 'CLUSTER_SF'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cluster ({totalCounts.clusterCount})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('MAIN_FEEDER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              typeFilter === 'MAIN_FEEDER'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Main Feeder ({totalCounts.mainFeederCount})
          </button>
        </div>
      </div>

      {/* Clusters List Separated by Category */}
      <div className="space-y-8">
        {filteredClusters.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-sm text-slate-500">
            Tidak ada cluster/link yang cocok dengan pencarian Anda.
          </div>
        ) : (
          (() => {
            const renderClusterCard = (cluster: ClusterBoqView) => {
              const isMainFeeder = cluster.projectType === 'MAIN_FEEDER';

              return (
                <div
                  key={cluster.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`p-2.5 text-white rounded-xl shadow-sm shrink-0 ${
                          isMainFeeder ? 'bg-indigo-600' : 'bg-blue-600'
                        }`}
                      >
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <h2 className="text-base font-bold text-slate-900 min-w-0 break-all leading-snug">
                            {cluster.name}
                          </h2>
                          {isMainFeeder && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0">
                              MAIN FEEDER (100%)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Home Passes:{' '}
                          <strong className="text-slate-700">{cluster.homePasses || '-'}</strong> • Progress:{' '}
                          <strong className="text-blue-600">{cluster.totalWeightedPercentage}%</strong>{' '}
                          {isMainFeeder
                            ? `(Main Feeder 100%: ${cluster.sfPercentage}%)`
                            : `(CLR 70%: ${cluster.clrPercentage}% | SF 30%: ${cluster.sfPercentage}%)`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openAddModal(cluster)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold rounded-lg text-xs transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Tambah Item BOQ
                        </button>
                      )}
                      {canCreateInput && (
                        <Link
                          href={`/daily-input?clusterId=${cluster.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs transition"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Input Harian
                        </Link>
                      )}
                      {canViewMatrix && (
                        <Link
                          href={`/matrix?clusterId=${cluster.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg text-xs transition"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Matriks
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3">Item Pekerjaan</th>
                          <th className="p-3 w-24 text-center">Scope</th>
                          <th className="p-3 w-28">Kategori</th>
                          <th className="p-3 w-20 text-center">Satuan</th>
                          <th className="p-3 w-28 text-right">Target BOQ</th>
                          <th className="p-3 w-28 text-right">Terpasang</th>
                          <th className="p-3 w-28 text-right">Sisa</th>
                          <th className="p-3 w-24 text-center">Prog %</th>
                          <th className="p-3 w-28 text-center">Status Final</th>
                          {canEdit && <th className="p-3 w-24 text-right">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {cluster.items.length === 0 ? (
                          <tr>
                            <td colSpan={canEdit ? 10 : 9} className="p-6 text-center text-slate-400">
                              Belum ada item BOQ terdaftar. Klik &quot;+ Tambah Item BOQ&quot; di kanan atas kartu ini.
                            </td>
                          </tr>
                        ) : (
                          cluster.items.map((it) => (
                            <tr key={it.id} className="hover:bg-slate-50 transition">
                              <td className="p-3 font-semibold text-slate-900">{it.itemName}</td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    it.scope === 'MAIN_FEEDER'
                                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                      : it.scope === 'SUBFEEDER'
                                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                      : 'bg-blue-100 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {it.scope === 'MAIN_FEEDER'
                                    ? 'MF (100%)'
                                    : it.scope === 'SUBFEEDER'
                                    ? 'SF (30%)'
                                    : 'CLR (70%)'}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  {it.category}
                                </span>
                              </td>
                              <td className="p-3 text-center text-slate-500">{it.unit}</td>
                              <td className="p-3 text-right font-bold text-slate-800 tabular-nums">
                                {it.boq.toLocaleString('en-US')}
                              </td>
                              <td className="p-3 text-right font-bold text-blue-600 tabular-nums">
                                {it.installed.toLocaleString('en-US')}
                              </td>
                              <td className="p-3 text-right text-slate-600 tabular-nums">
                                {it.remaining.toLocaleString('en-US')}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    it.percentage >= 100
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : it.percentage > 0
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {it.percentage}%
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    it.status === 'DONE'
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                      : it.status === 'HOLD'
                                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                      : 'bg-blue-100 text-blue-700 border border-blue-300'
                                  }`}
                                >
                                  {it.status === 'DONE'
                                    ? '✓ DONE'
                                    : it.status === 'HOLD'
                                    ? '⏸️ HOLD'
                                    : '⚡ ONGOING'}
                                </span>
                              </td>
                              {canEdit && (
                                <td className="p-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(cluster, it)}
                                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                      title="Edit Jenis Item / Target BOQ"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(cluster, it)}
                                      disabled={deletingId === it.id}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-50"
                                      title="Hapus Item BOQ"
                                    >
                                      {deletingId === it.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            };

            return (
              <>
                {clusterOnlyList.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                        PEKERJAAN CLUSTER &amp; SUBFEEDER ({clusterOnlyList.length})
                      </span>
                      <span className="text-xs text-slate-500">Bobot 70% Cluster + 30% Subfeeder</span>
                    </div>
                    <div className="space-y-5">{clusterOnlyList.map(renderClusterCard)}</div>
                  </div>
                )}

                {mainFeederOnlyList.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        PEKERJAAN MAIN FEEDER ({mainFeederOnlyList.length})
                      </span>
                      <span className="text-xs text-slate-500">Bobot 100% Feeder • Tanpa Cluster</span>
                    </div>
                    <div className="space-y-5">{mainFeederOnlyList.map(renderClusterCard)}</div>
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* Modal Edit / Tambah Item BOQ */}
      {modalOpen && targetCluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {modalMode === 'EDIT' ? 'Edit Item & Target BOQ' : 'Tambah Item BOQ Baru'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 break-all">
                  Target: <strong className="text-slate-700">{targetCluster.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Jenis Item Pekerjaan (Standar BOQ) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedStandardName}
                  onChange={(e) => setSelectedStandardName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STANDARD_ITEM_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__CUSTOM__">✏️ Nama Item Custom Lainnya...</option>
                </select>
              </div>

              {selectedStandardName === '__CUSTOM__' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Nama Item Custom <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    placeholder="Masukkan nama item pekerjaan..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Scope Pekerjaan</label>
                  <select
                    value={effectiveScope}
                    disabled={targetCluster.projectType === 'MAIN_FEEDER'}
                    onChange={(e) => setFormScope(e.target.value as WorkItemScope)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                  >
                    {targetCluster.projectType === 'MAIN_FEEDER' ? (
                      <option value="MAIN_FEEDER">🛣️ Main Feeder (100%)</option>
                    ) : (
                      <>
                        <option value="CLUSTER">🏙️ Cluster (70%)</option>
                        <option value="SUBFEEDER">📡 Subfeeder (30%)</option>
                      </>
                    )}
                  </select>
                  {targetCluster.projectType !== 'MAIN_FEEDER' &&
                    SUBFEEDER_ONLY_SET.has(effectiveItemName.toLowerCase()) && (
                      <p className="text-[10px] text-purple-700 mt-1">
                        Kabel 96c/144c/288c otomatis masuk scope Subfeeder.
                      </p>
                    )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Target BOQ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={formBoq}
                    onChange={(e) => setFormBoq(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Info realisasi terpasang / merge */}
              {modalMode === 'EDIT' &&
                editingItem &&
                editingItem.installed > 0 &&
                !conflictingExistingItem &&
                (editingItem.itemName !== effectiveItemName || editingItem.scope !== effectiveScope) && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      Realisasi terpasang <strong>{editingItem.installed.toLocaleString('en-US')} {editingItem.unit}</strong>{' '}
                      akan otomatis dipindahkan dari <strong>{editingItem.itemName}</strong> ke{' '}
                      <strong>{effectiveItemName}</strong>.
                    </span>
                  </div>
                )}

              {conflictingExistingItem && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">
                      {modalMode === 'EDIT'
                        ? `Item "${conflictingExistingItem.itemName}" sudah ada di cluster ini (BOQ saat ini: ${conflictingExistingItem.boq.toLocaleString('en-US')}).`
                        : `Item "${conflictingExistingItem.itemName}" sudah ada di scope ini.`}
                    </p>
                    <p>
                      {modalMode === 'EDIT' && editingItem
                        ? `Jika disimpan, seluruh input terpasang (${editingItem.installed.toLocaleString('en-US')}) dari "${editingItem.itemName}" akan DIGABUNGKAN (merge) ke "${conflictingExistingItem.itemName}" dengan Target BOQ sebesar ${formBoq || 0}.`
                        : `Target BOQ item "${conflictingExistingItem.itemName}" akan diperbarui ke ${formBoq || 0}.`}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>
                    {conflictingExistingItem && modalMode === 'EDIT'
                      ? 'Gabungkan & Simpan'
                      : 'Simpan Perubahan'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
