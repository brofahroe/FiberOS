'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  Upload,
  Layers,
  MapPin,
  UserCheck,
  Users,
  LogOut,
  Loader2,
} from 'lucide-react';
import FiberOsLogo from '@/components/FiberOsLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { logoutAction } from '@/actions/auth';
import type { SessionUser } from '@/lib/authSession';
import { hasAnyDailyInputAccess } from '@/lib/permissions';

export default function Navbar({ currentUser }: { currentUser: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  if (pathname === '/login' || !currentUser) {
    return null;
  }

  const handleLogout = async () => {
    setLoggingOut(true);
    await logoutAction();
    router.replace('/login');
    router.refresh();
  };

  const perms = currentUser.permissions;
  const allNavLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, allowed: perms.dashboardView },
    {
      href: '/daily-input',
      label: 'Input Harian',
      icon: PlusCircle,
      highlight: true,
      allowed: hasAnyDailyInputAccess(perms),
    },
    { href: '/matrix', label: 'Matriks & Ekspor', icon: FileSpreadsheet, allowed: perms.matrixView },
    {
      href: '/sitelist',
      label: 'Sitelist',
      icon: MapPin,
      allowed: perms.sitelistView || perms.sitelistManage,
    },
    { href: '/import-boq', label: 'Impor BOQ', icon: Upload, allowed: perms.importBoq },
    {
      href: '/clusters',
      label: 'Cluster & BOQ',
      icon: Layers,
      allowed: perms.clustersView || perms.clustersEdit,
    },
  ];
  const navLinks = allNavLinks.filter((l) => l.allowed);

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900/95 dark:backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <FiberOsLogo className="w-10 h-10 drop-shadow-sm group-hover:scale-105 transition-transform" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600 dark:from-white dark:via-blue-300 dark:to-sky-300 bg-clip-text text-transparent">
                  FiberOS
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-700/70 rounded-md">
                  FTTH
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium -mt-1">
                GCI Rollout
              </p>
            </div>
          </Link>

          {/* Desktop Nav + User Actions */}
          <div className="flex items-center gap-2">
            {!currentUser.mustChangePassword && (
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-1.5 px-2.5 lg:px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                        link.highlight
                          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/30'
                          : isActive
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          link.highlight
                            ? 'text-white'
                            : isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            )}

            <div className="flex items-center gap-1.5 pl-1">
              {currentUser.role === 'ADMIN' && !currentUser.mustChangePassword && (
                <Link
                  href="/admin/users"
                  title="Kelola User (Admin)"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    pathname === '/admin/users'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">User</span>
                </Link>
              )}

              <Link
                href="/profile"
                title={`Profil: ${currentUser.fullName} (${currentUser.jobTitle})`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all max-w-[140px] ${
                  pathname === '/profile'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 hover:bg-blue-100'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{currentUser.fullName || currentUser.username}</span>
              </Link>

              <ThemeToggle />

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                title="Keluar (Logout)"
                aria-label="Keluar"
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 text-xs font-semibold transition-all disabled:opacity-60"
              >
                {loggingOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span className="hidden xl:inline">Keluar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {!currentUser.mustChangePassword && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex justify-around items-center shadow-lg">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center py-1 px-2 rounded-lg text-[11px] font-medium transition-all ${
                  link.highlight && isActive
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-full ${link.highlight ? 'bg-blue-600 text-white shadow-sm' : ''}`}>
                  <Icon className={`w-5 h-5 ${link.highlight ? 'text-white' : ''}`} />
                </div>
                <span className="mt-0.5">{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}

