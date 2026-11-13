'use client';

import { useState, useEffect } from 'react';
import { exportMatrixToExcel, updateWorkItemStatus } from '@/actions/matrix';
import { updateDailyCellProgress } from '@/actions/dailyProgress';
import { Download, Search, Filter, Loader2, FileSpreadsheet, Edit3, Trash2, X, Check, AlertCircle, MessageSquare } from 'lucide-react';
import WhatsAppReportModal from '@/components/WhatsAppReportModal';

interface ClusterInfo {
  id: string;
  name: string;
}

interface MatrixRowItem {
  workItemId: string;
  clusterId: string;
  clusterName: string;
  homePasses: number;
  scope?: string;
  workType?: string;
  category: string;
  subCategory?: string | null;
  weight?: number;
  itemName: string;
  unit: string;
  boq: number;
  totalInstalled: number;
  remaining: number;
  percentage: number;
  status: string;
  dailyValues: { [dateStr: string]: number };
}

interface EditingCellState {
  clusterId: string;
  clusterName: string;
  workItemId: string;
  itemName: string;
  unit: string;
  dateStr: string;
  currentValue: number;
}

export default function MatrixClient({
  dates,
  matrixRows,
  clustersList,
  initialClusterId,
}: {
  dates: string[];
  matrixRows: MatrixRowItem[];
  clustersList: ClusterInfo[];
  initialClusterId?: string;
}) {
  const [rows, setRows] = useState<MatrixRowItem[]>(matrixRows);
  const [selectedCluster, setSelectedCluster] = useState<string>(initialClusterId || 'ALL');
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'CLUSTER' | 'SUBFEEDER'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);
  const [rowStatuses, setRowStatuses] = useState<{ [id: string]: string }>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Edit cell modal state
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [newQuantityInput, setNewQuantityInput] = useState<string>('');
  const [savingCell, setSavingCell] = useState<boolean>(false);

  // WhatsApp modal state
  const [showWaModal, setShowWaModal] = useState<boolean>(false);
  const [waTarget, setWaTarget] = useState<{ clusterId: string; dateStr: string }>({
    clusterId: '',
    dateStr: '',
  });

  useEffect(() => {
    setRows(matrixRows);
  }, [matrixRows]);

  const handleStatusChange = async (workItemId: string, newStatus: string) => {
    setRowStatuses((prev) => ({ ...prev, [workItemId]: newStatus }));
    setUpdatingId(workItemId);
    const res = await updateWorkItemStatus(workItemId, newStatus);
    setUpdatingId(null);
    if (!res.success) {
      alert(res.error || 'Gagal mengubah status');
    }
  };

  const handleOpenEditCell = (row: MatrixRowItem, dateStr: string) => {
    const currentVal = row.dailyValues[dateStr] || 0;
    const clusterName = row.clusterName || clustersList.find((c) => c.id === row.clusterId)?.name || 'Cluster';
    setEditingCell({
      clusterId: row.clusterId,
      clusterName,
      workItemId: row.workItemId,
      itemName: row.itemName,
      unit: row.unit,
      dateStr,
      currentValue: currentVal,
    });
    setNewQuantityInput(currentVal > 0 ? String(currentVal) : '');
  };

  const handleSaveCell = async (newVal: number) => {
    if (!editingCell) return;
    setSavingCell(true);
    const res = await updateDailyCellProgress(
      editingCell.clusterId,
      editingCell.workItemId,
      editingCell.dateStr,
      newVal
    );
    setSavingCell(false);

    if (res.success) {
      setRows((prev) =>
        prev.map((r) => {
          if (r.workItemId === editingCell.workItemId) {
            const oldVal = r.dailyValues[editingCell.dateStr] || 0;
            const diff = newVal - oldVal;
            const newTotal = Math.max(0, Math.round((r.totalInstalled + diff) * 10) / 10);
            const isDone = (rowStatuses[r.workItemId] || r.status) === 'DONE';
            const newRemaining = isDone ? 0 : Math.max(0, Math.round((r.boq - newTotal) * 10) / 10);
            const newPct = isDone
              ? 100
              : r.boq > 0
              ? Math.min(100, Math.round((newTotal / r.boq) * 100))
              : newTotal > 0
              ? 100
              : 0;

            const updatedDaily = { ...r.dailyValues };
            if (newVal > 0) {
              updatedDaily[editingCell.dateStr] = newVal;
            } else {
              delete updatedDaily[editingCell.dateStr];
            }

            return {
              ...r,
              totalInstalled: newTotal,
              remaining: newRemaining,
              percentage: newPct,
              dailyValues: updatedDaily,
            };
          }
          return r;
        })
      );
      setEditingCell(null);
    } else {
      alert(res.error || 'Gagal menyimpan perubahan');
    }
  };

  // Filter rows
  const filteredRows = rows.filter((r) => {
    const matchesCluster = selectedCluster === 'ALL' || r.clusterId === selectedCluster;
    const matchesScope = selectedScope === 'ALL' || (r.scope || 'CLUSTER') === selectedScope;
    const matchesSearch = !searchTerm || r.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || r.clusterName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCluster && matchesScope && matchesSearch;
  });

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await exportMatrixToExcel(selectedCluster);
      
      // Convert base64 to blob and trigger download
      const byteCharacters = atob(res.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal mengekspor file Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            Matriks Progres Harian & BOQ
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tabel matriks instalasi harian per cluster, format setara spreadsheet resmi proyek.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Export to Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetClusterId = selectedCluster !== 'ALL' ? selectedCluster : (clustersList[0]?.id || '');
              const latestDate = dates[dates.length - 1] || '12-Nov-26';
              setWaTarget({ clusterId: targetClusterId, dateStr: latestDate });
              setShowWaModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-emerald-400 border border-slate-800 rounded-xl text-xs font-bold shadow-md transition"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>Format WA</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Filter Cluster:</span>
          <select
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Semua Cluster ({clustersList.length})</option>
            {clustersList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Scope:</span>
          <select
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Semua Scope (CLR + SF)</option>
            <option value="CLUSTER">🏙️ Cluster Saja (70%)</option>
            <option value="SUBFEEDER">📡 Subfeeder Saja (30%)</option>
          </select>
        </div>

        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari item pekerjaan (misal: Pole, Kabel 24c, FAT)..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2 pointer-events-none" />
        </div>
      </div>

      {/* Tip Banner */}
      <div className="flex items-center gap-2 text-xs text-slate-600 bg-blue-50/70 border border-blue-100 px-4 py-2.5 rounded-xl">
        <span className="text-blue-700 font-bold">💡 Fitur Koreksi:</span>
        <span>Jika ada salah input atau salah tanggal, cukup <strong>klik angka pada kolom tanggal</strong> di tabel untuk langsung mengedit nilai volume atau menghapusnya.</span>
      </div>

      {/* The Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="p-3 border-b border-r border-slate-200 min-w-[140px] sticky left-0 bg-slate-100 z-30">
                  Cluster
                </th>
                <th className="p-3 border-b border-r border-slate-200 w-16 text-center">
                  HP
                </th>
                <th className="p-3 border-b border-r border-slate-200 w-24 text-center">
                  Scope
                </th>
                <th className="p-3 border-b border-r border-slate-200 min-w-[200px]">
                  Item Pekerjaan
                </th>
                <th className="p-3 border-b border-r border-slate-200 w-16 text-center">
                  Satuan
                </th>
                {dates.map((dateStr) => (
                  <th
                    key={dateStr}
                    className="p-2 border-b border-r border-slate-200 text-center min-w-[65px] font-medium text-[11px] text-slate-600 bg-slate-50"
                  >
                    {dateStr}
                  </th>
                ))}
                <th className="p-3 border-b border-r border-slate-200 text-right min-w-[80px] bg-blue-50/80 text-blue-900 font-bold">
                  TOTAL
                </th>
                <th className="p-3 border-b border-r border-slate-200 text-right min-w-[80px] bg-slate-200/70 text-slate-900 font-bold">
                  BOQ
                </th>
                <th className="p-3 border-b border-r border-slate-200 text-right min-w-[80px] text-slate-600">
                  SISA
                </th>
                <th className="p-3 border-b border-slate-200 text-center min-w-[80px] bg-slate-100 font-bold border-r">
                  PROG %
                </th>
                <th className="p-3 border-b border-slate-200 text-center min-w-[130px] bg-slate-100 font-bold sticky right-0 z-30">
                  STATUS FINAL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={dates.length + 10} className="p-8 text-center text-slate-400">
                    Tidak ada data yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const currentStatus = rowStatuses[row.workItemId] || row.status || 'ONGOING';
                  const isDone = currentStatus === 'DONE';
                  const effectiveRemaining = isDone ? 0 : row.remaining;
                  const effectivePercentage = isDone ? 100 : row.percentage;
                  return (
                    <tr key={idx} className="hover:bg-blue-50/30 transition">
                      <td className="p-2.5 font-bold text-slate-900 border-r border-slate-100 sticky left-0 bg-white">
                        {row.clusterName}
                      </td>
                      <td className="p-2.5 text-center border-r border-slate-100 text-slate-500">
                        {row.homePasses || ''}
                      </td>
                      <td className="p-2.5 text-center border-r border-slate-100">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.scope === 'SUBFEEDER'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {row.scope === 'SUBFEEDER' ? 'SF (30%)' : 'CLR (70%)'}
                        </span>
                      </td>
                      <td className="p-2.5 font-medium border-r border-slate-100 text-slate-800">
                        {row.itemName}
                      </td>
                      <td className="p-2.5 text-center border-r border-slate-100 text-slate-400">
                        {row.unit}
                      </td>
                      {dates.map((dateStr) => {
                        const val = row.dailyValues[dateStr];
                        return (
                          <td
                            key={dateStr}
                            onClick={() => handleOpenEditCell(row, dateStr)}
                            title="Klik untuk mengoreksi volume atau menghapus salah input"
                            className={`p-2 text-center border-r border-slate-100 cursor-pointer transition hover:bg-blue-100 hover:ring-2 hover:ring-blue-400 select-none group ${
                              val ? 'font-bold text-blue-700 bg-blue-50/50' : 'text-slate-300 hover:text-slate-600'
                            }`}
                          >
                            <span className="inline-block px-1 rounded">
                              {val || '-'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-right font-bold text-blue-700 bg-blue-50/30 border-r border-slate-100">
                        {row.totalInstalled.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-900 bg-slate-100/40 border-r border-slate-100">
                        {row.boq.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-right text-slate-600 border-r border-slate-100">
                        {effectiveRemaining.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-center border-r border-slate-100">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            effectivePercentage >= 100
                              ? 'bg-emerald-100 text-emerald-700'
                              : effectivePercentage > 0
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {effectivePercentage}%
                        </span>
                      </td>
                      <td className="p-2 text-center sticky right-0 bg-white shadow-sm">
                        <select
                          value={currentStatus}
                          onChange={(e) => handleStatusChange(row.workItemId, e.target.value)}
                          disabled={updatingId === row.workItemId}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                            currentStatus === 'DONE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : currentStatus === 'HOLD'
                              ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                              : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                          }`}
                        >
                          <option value="ONGOING">⚡ ONGOING</option>
                          <option value="DONE">✓ DONE (Final)</option>
                          <option value="HOLD">⏸️ HOLD</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Cell Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Koreksi Volume Harian</h3>
                  <p className="text-[11px] text-slate-500">Koreksi jika terjadi salah ketik atau salah input tanggal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                disabled={savingCell}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Cluster:</span>
                  <span className="font-bold text-slate-800">{editingCell.clusterName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Item Pekerjaan:</span>
                  <span className="font-bold text-slate-800 text-right">{editingCell.itemName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Tanggal Progres:</span>
                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {editingCell.dateStr}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Volume Saat Ini:</span>
                  <span className="font-bold text-slate-700">
                    {editingCell.currentValue} {editingCell.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Volume Baru ({editingCell.unit})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    autoFocus
                    value={newQuantityInput}
                    onChange={(e) => setNewQuantityInput(e.target.value)}
                    placeholder="Ketik volume baru (misal: 25)..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-semibold text-slate-400 pointer-events-none">
                    {editingCell.unit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ketik 0 atau kosongkan untuk menghapus/membatalkan progres tanggal ini.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={savingCell}
                  onClick={() => handleSaveCell(parseFloat(newQuantityInput) || 0)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {savingCell ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Perubahan</span>
                </button>

                {editingCell.currentValue > 0 && (
                  <button
                    type="button"
                    disabled={savingCell}
                    onClick={() => {
                      if (confirm(`Yakin ingin menghapus progres ${editingCell.itemName} tanggal ${editingCell.dateStr}?`)) {
                        handleSaveCell(0);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Report Modal */}
      {showWaModal && (
        <WhatsAppReportModal
          isOpen={showWaModal}
          onClose={() => setShowWaModal(false)}
          clusterId={waTarget.clusterId || (selectedCluster !== 'ALL' ? selectedCluster : (clustersList[0]?.id || ''))}
          reportDate={waTarget.dateStr || (dates[dates.length - 1] || '12-Nov-26')}
        />
      )}
    </div>
  );
}

