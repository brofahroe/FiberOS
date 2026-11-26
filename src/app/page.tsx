import { redirect } from 'next/navigation';
import { getDashboardData } from '@/actions/dashboard';
import { getCurrentUser } from '@/lib/auth';
import { getFirstAllowedPath, hasAnyDailyInputAccess } from '@/lib/permissions';
import SeedButton from '@/components/SeedButton';
import DashboardSummaryClient from '@/components/DashboardSummaryClient';
import RecentReportsCard from '@/components/RecentReportsCard';
import Link from 'next/link';
import { Upload } from 'lucide-react';

export const revalidate = 0; // Fresh on every request

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (!currentUser.permissions.dashboardView) {
    redirect(getFirstAllowedPath(currentUser));
  }

  const data = await getDashboardData();
  const { project, categories, clusters, recentReports } = data;
  const canCreateInput = currentUser.permissions.dailyInputCreate;
  const canEditDaily = currentUser.permissions.dailyInputEditScope !== 'NONE';
  const canAccessDailyInput = hasAnyDailyInputAccess(currentUser.permissions);

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
    <div className="space-y-5">
      {/* Compact Hero Header */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-2xl px-6 py-5 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-56 h-56 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-semibold tracking-wider text-blue-200 uppercase mb-1.5">
              <span>⚡ Live Rollout Monitoring</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {project.name}
            </h1>
            <p className="text-blue-100/80 text-xs sm:text-sm mt-0.5">
              Monitoring realisasi tiang, penarikan kabel, FAT, FDT &amp; Main Feeder harian.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md text-xs text-blue-100 font-semibold shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{clusters.length} Area Terdaftar</span>
          </div>
        </div>
      </div>

      <DashboardSummaryClient
        project={project}
        categories={categories}
        clusters={clusters}
        canCreateInput={canCreateInput}
      />

      {/* Recent Updates / Activity Log */}
      <RecentReportsCard
        reports={recentReports}
        canEditReports={canEditDaily}
        canOpenDailyInput={canAccessDailyInput}
      />
    </div>
  );
}

