'use client';

import { useState } from 'react';
import { exportMatrixToExcel, updateWorkItemStatus } from '@/actions/matrix';
import { Download, Search, Filter, Loader2, FileSpreadsheet } from 'lucide-react';

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
  const [selectedCluster, setSelectedCluster] = useState<string>(initialClusterId || 'ALL');
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'CLUSTER' | 'SUBFEEDER'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);
  const [rowStatuses, setRowStatuses] = useState<{ [id: string]: string }>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatusChange = async (workItemId: string, newStatus: string) => {
    setRowStatuses((prev) => ({ ...prev, [workItemId]: newStatus }));
    setUpdatingId(workItemId);
    const res = await updateWorkItemStatus(workItemId, newStatus);
    setUpdatingId(null);
    if (!res.success) {
      alert(res.error || 'Gagal mengubah status');
    }
  };

  // Filter rows
  const filteredRows = matrixRows.filter((r) => {
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
                            className={`p-2 text-center border-r border-slate-100 ${
                              val ? 'font-bold text-blue-700 bg-blue-50/50' : 'text-slate-300'
                            }`}
                          >
                            {val || '-'}
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
    </div>
  );
}

