import Link from 'next/link';
import { getDashboardData } from '@/actions/dashboard';
import SeedButton from '@/components/SeedButton';
import DashboardSummaryClient from '@/components/DashboardSummaryClient';
import RecentReportsCard from '@/components/RecentReportsCard';
import { 
  PlusCircle, 
  FileSpreadsheet, 
  Upload, 
  MapPin
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
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 text-blue-700 dark:text-sky-300 dark:border dark:border-white/20 font-bold text-sm rounded-xl shadow-lg hover:bg-blue-50 dark:hover:bg-slate-800 transition transform hover:-translate-y-0.5"
            >
              <PlusCircle className="w-4 h-4 text-blue-600" />
              Input Progress Harian
            </Link>
            <Link
              href="/sitelist"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white font-medium text-sm rounded-xl backdrop-blur-md border border-white/20 transition"
            >
              <MapPin className="w-4 h-4" />
              Sitelist & Wilayah
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

      <DashboardSummaryClient
        project={project}
        categories={categories}
        clusters={clusters}
      />

      {/* Recent Updates / Activity Log */}
      <RecentReportsCard reports={recentReports} />
    </div>
  );
}

