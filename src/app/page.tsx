import Link from 'next/link';
import { getDashboardData } from '@/actions/dashboard';
import SeedButton from '@/components/SeedButton';
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  Layers, 
  PlusCircle, 
  TrendingUp, 
  FileSpreadsheet, 
  Upload, 
  ArrowRight,
  HardHat,
  Cable,
  Box,
  Cpu,
  Edit3
} from 'lucide-react';

export const revalidate = 0; // Fresh on every request

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { project, categories, clusters, recentReports } = data;

  if (!project) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-xl mx-auto space-y-4">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
          ⚡
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900">Database Siap Digunakan</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Klik tombol di bawah untuk memuat otomatis seluruh 15 cluster dan histori data Google Spreadsheet Blora, atau unggah file BOQ baru.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
          <SeedButton />
          <Link
            href="/import-boq"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition"
          >
            <Upload className="w-4 h-4" />
            Impor File BOQ
          </Link>
        </div>
      </div>
    );
  }

  const categoryIcons: { [key: string]: any } = {
    POLE: HardHat,
    CABLE: Cable,
    FAT: Box,
    FDT: Cpu,
    ACCESSORY: Layers,
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Hero Header */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold tracking-wider text-blue-200 uppercase mb-3">
              ⚡ Live Rollout Monitoring
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {project.name}
            </h1>
            <p className="text-blue-100/80 text-sm mt-1 max-w-xl">
              Monitoring realisasi penanaman tiang, penarikan kabel, serta terminasi FAT & FDT per cluster per hari.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/daily-input"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-blue-700 font-bold text-sm rounded-xl shadow-lg hover:bg-blue-50 transition transform hover:-translate-y-0.5"
            >
              <PlusCircle className="w-4 h-4 text-blue-600" />
              Input Progress Harian
            </Link>
            <Link
              href="/matrix"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white font-medium text-sm rounded-xl backdrop-blur-md border border-white/20 transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Matriks & Ekspor
            </Link>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Progress</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{project.overallProgress}%</span>
            <span className="text-xs text-slate-500">keseluruhan</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${project.overallProgress}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Home Pass</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{project.totalHomePasses.toLocaleString()}</span>
            <span className="text-xs text-slate-500">HP</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Kapasitas jaringan terencana</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Cluster</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{project.totalClusters}</span>
            <span className="text-xs text-slate-500">area cluster</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Kedungtuban & sekitarnya</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Volume Terpasang</span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{project.totalInstalled.toLocaleString()}</span>
            <span className="text-xs text-slate-500">/ {project.totalBoq.toLocaleString()}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Total item volume vs BOQ</p>
        </div>
      </div>

      {/* Progress Breakdown by Category */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Realisasi per Kategori Pekerjaan</h2>
            <p className="text-xs text-slate-500 mt-0.5">Akumulasi progres instalasi terhadap target BOQ</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.filter(c => c.category !== 'ACCESSORY').map((cat) => {
            const Icon = categoryIcons[cat.category] || Layers;
            return (
              <div key={cat.category} className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-slate-800">{cat.displayName}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{cat.percentage}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Terpasang: <strong className="text-slate-700">{cat.installed.toLocaleString()}</strong> {cat.unit}</span>
                  <span>BOQ: {cat.boq.toLocaleString()} {cat.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cluster Progress Overview Cards */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Progress Monitoring per Cluster</h2>
            <p className="text-xs text-slate-500 mt-0.5">Daftar seluruh cluster dan status penyelesaiannya</p>
          </div>
          <Link
            href="/matrix"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
          >
            Lihat Tabel Lengkap <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((cluster) => {
            return (
              <div
                key={cluster.id}
                className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition bg-white"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{cluster.name}</h3>
                    <p className="text-xs text-slate-500">
                      Home Passes: <span className="font-semibold text-slate-700">{cluster.homePasses || '-'}</span>
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
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
                      cluster.percentage >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                    }`}
                    style={{ width: `${cluster.percentage}%` }}
                  />
                </div>

                {/* Scope Breakdown Bars: CLR (70%) vs SF (30%) */}
                <div className="space-y-1.5 my-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {/* CLR Bar */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
                        Cluster (70%):
                      </span>
                      <span className="font-bold text-blue-700">
                        {cluster.clrPercentage || 0}% <span className="text-[10px] text-slate-400 font-normal">({cluster.clrContribution || 0}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${cluster.clrPercentage || 0}%` }}
                      />
                    </div>
                  </div>

                  {/* SF Bar */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-600 inline-block"></span>
                        Subfeeder (30%):
                      </span>
                      <span className="font-bold text-purple-700">
                        {cluster.sfPercentage || 0}% <span className="text-[10px] text-slate-400 font-normal">({cluster.sfContribution || 0}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-purple-600 transition-all duration-300"
                        style={{ width: `${cluster.sfPercentage || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Key items quick stats */}
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs grid grid-cols-2 gap-y-1.5 text-slate-600">
                  {cluster.workItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex justify-between pr-2 truncate">
                      <span className="truncate pr-1 text-slate-500">{item.itemName}:</span>
                      <span className="font-medium text-slate-800 shrink-0">
                        {item.installed} / {item.boq}
                      </span>
                    </div>
                  ))}
                </div>

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
          })}
        </div>
      </div>

      {/* Recent Updates / Activity Log */}
      {recentReports.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Riwayat Laporan Terakhir</h2>
              <p className="text-xs text-slate-500">Log penginputan progres harian dari tim lapangan</p>
            </div>
            <Clock className="w-5 h-5 text-slate-400" />
          </div>

          <div className="divide-y divide-slate-100">
            {recentReports.slice(0, 5).map((rep) => (
              <div key={rep.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-800">{rep.cluster.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                      {rep.reportDate}
                    </span>
                    {rep.weather && (
                      <span className="text-xs text-slate-500 italic">({rep.weather})</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Oleh: <strong className="text-slate-700">{rep.reporterName || 'Tim Lapangan'}</strong>
                    {rep.teamName ? ` (${rep.teamName})` : ''}
                    {rep.notes ? ` — "${rep.notes}"` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                    {rep.items.length} item terupdate
                  </span>
                  <Link
                    href={`/daily-input?clusterId=${rep.clusterId}&date=${encodeURIComponent(rep.reportDate)}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

