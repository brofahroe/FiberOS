'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Edit3,
  Pencil,
  Users,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { renameDailyReportTeam } from '@/actions/dailyProgress';

export interface RecentReportTeamEntry {
  reportId: string;
  teamName: string;
  itemCount: number;
}

export interface RecentReportEntry {
  id: string;
  clusterId: string;
  cluster: { id: string; name: string };
  reportDate: string;
  teamName: string;
  reportTeams: RecentReportTeamEntry[];
  items: Array<{ workItemId: string }>;
}

interface RenameModalState {
  reportId: string;
  clusterName: string;
  reportDate: string;
  oldTeamName: string;
}

export default function RecentReportsCard({
  reports,
  canEditReports = true,
  canOpenDailyInput = true,
}: {
  reports: RecentReportEntry[];
  canEditReports?: boolean;
  canOpenDailyInput?: boolean;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState<boolean>(false);
  const [filterCluster, setFilterCluster] = useState<string>('ALL');
  const [renameTarget, setRenameTarget] = useState<RenameModalState | null>(null);
  const [newTeamName, setNewTeamName] = useState<string>('');
  const [renameScope, setRenameScope] = useState<'SINGLE' | 'CLUSTER' | 'ALL'>('SINGLE');
  const [saving, setSaving] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const clusterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reports) {
      map.set(r.clusterId, r.cluster.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reports]);

  const knownTeams = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) {
      for (const t of r.reportTeams) {
        if (t.teamName && t.teamName !== 'Tanpa Nama Tim') {
          set.add(t.teamName);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const base =
      filterCluster === 'ALL'
        ? reports
        : reports.filter((r) => r.clusterId === filterCluster);
    return showAll ? base : base.slice(0, 10);
  }, [reports, filterCluster, showAll]);

  const totalMatching = useMemo(() => {
    return filterCluster === 'ALL'
      ? reports.length
      : reports.filter((r) => r.clusterId === filterCluster).length;
  }, [reports, filterCluster]);

  if (reports.length === 0) return null;

  const openRenameModal = (rep: RecentReportEntry, team: RecentReportTeamEntry) => {
    setRenameTarget({
      reportId: team.reportId,
      clusterName: rep.cluster.name,
      reportDate: rep.reportDate,
      oldTeamName: team.teamName,
    });
    setNewTeamName(team.teamName === 'Tanpa Nama Tim' ? '' : team.teamName);
    setRenameScope('SINGLE');
    setModalError(null);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;

    const trimmed = newTeamName.trim();
    if (!trimmed) {
      setModalError('Nama Tim Pelaksana baru wajib diisi.');
      return;
    }

    setSaving(true);
    setModalError(null);

    const res = await renameDailyReportTeam({
      reportId: renameTarget.reportId,
      newTeamName: trimmed,
      scope: renameScope,
    });

    setSaving(false);

    if (!res.success) {
      setModalError(res.error || 'Gagal mengganti nama tim.');
      return;
    }

    setRenameTarget(null);
    setToastMessage(res.message || `Nama tim berhasil diubah menjadi "${trimmed}".`);
    router.refresh();
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Riwayat Laporan Terakhir</h2>
          <p className="text-xs text-slate-500">
            Ringkasan progres harian per cluster — klik badge nama tim untuk mengganti nama tim lama
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {clusterOptions.length > 1 && (
            <select
              value={filterCluster}
              onChange={(e) => setFilterCluster(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter cluster riwayat"
            >
              <option value="ALL">Semua Cluster ({reports.length})</option>
              {clusterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {totalMatching > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Ringkas (10)</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Lihat Semua ({totalMatching})</span>
                </>
              )}
            </button>
          )}

          <Clock className="w-5 h-5 text-slate-400 hidden sm:block" />
        </div>
      </div>

      {toastMessage && (
        <div className="mb-4 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-0.5 text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {filteredReports.map((rep) => {
          const primaryTeam = rep.reportTeams[0]?.teamName;
          const editHref =
            primaryTeam && primaryTeam !== 'Tanpa Nama Tim'
              ? `/daily-input?clusterId=${rep.clusterId}&date=${encodeURIComponent(
                  rep.reportDate
                )}&team=${encodeURIComponent(primaryTeam)}`
              : `/daily-input?clusterId=${rep.clusterId}&date=${encodeURIComponent(
                  rep.reportDate
                )}`;

          return (
            <div
              key={rep.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-slate-800">{rep.cluster.name}</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                    {rep.reportDate}
                  </span>
                  {rep.reportTeams.map((team) =>
                    canEditReports ? (
                      <button
                        key={team.reportId}
                        type="button"
                        onClick={() => openRenameModal(rep, team)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded text-[11px] font-semibold transition group cursor-pointer"
                        title={`Klik untuk ubah nama tim "${team.teamName}"`}
                      >
                        <span>{team.teamName}</span>
                        <Pencil className="w-2.5 h-2.5 text-indigo-500 group-hover:text-indigo-700" />
                      </button>
                    ) : (
                      <span
                        key={team.reportId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded text-[11px] font-semibold"
                      >
                        <span>{team.teamName}</span>
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  {rep.items.length} item terupdate
                </span>
                {canOpenDailyInput && (
                  <Link
                    href={editHref}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{canEditReports ? 'Edit' : 'Lihat'}</span>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rename Team Modal */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !saving && setRenameTarget(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Ubah Nama Tim Laporan</h3>
                  <p className="text-[11px] text-slate-500">
                    {renameTarget.clusterName} • {renameTarget.reportDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setRenameTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="p-5 space-y-4">
              <div>
                <div className="text-[11px] text-slate-500 mb-1">
                  Nama Tim Saat Ini:{' '}
                  <span className="font-bold text-slate-800">{renameTarget.oldTeamName}</span>
                </div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Tim Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  list="recent-reports-known-teams"
                  placeholder="Masukkan nama tim baru..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <datalist id="recent-reports-known-teams">
                  {knownTeams.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>

                {knownTeams.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {knownTeams.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewTeamName(t)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition ${
                          newTeamName.trim() === t
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {renameTarget.oldTeamName !== 'Tanpa Nama Tim' && (
                <div className="space-y-2 pt-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Cakupan Perubahan
                  </label>
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="renameScope"
                      checked={renameScope === 'SINGLE'}
                      onChange={() => setRenameScope('SINGLE')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 block">Hanya laporan ini</span>
                      <span className="text-[11px] text-slate-500">
                        {renameTarget.clusterName} tanggal {renameTarget.reportDate}
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="renameScope"
                      checked={renameScope === 'CLUSTER'}
                      onChange={() => setRenameScope('CLUSTER')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 block">
                        Semua riwayat cluster {renameTarget.clusterName}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Ubah semua laporan &quot;{renameTarget.oldTeamName}&quot; di cluster{' '}
                        {renameTarget.clusterName}
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="renameScope"
                      checked={renameScope === 'ALL'}
                      onChange={() => setRenameScope('ALL')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 block">
                        Semua riwayat di seluruh cluster
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Ubah seluruh laporan lama yang bernama &quot;{renameTarget.oldTeamName}&quot;
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setRenameTarget(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Nama Tim</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
