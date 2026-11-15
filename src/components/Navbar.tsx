'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileSpreadsheet, PlusCircle, Upload, Layers, MapPin } from 'lucide-react';
import FiberOsLogo from '@/components/FiberOsLogo';

export default function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/daily-input', label: 'Input Harian', icon: PlusCircle, highlight: true },
    { href: '/matrix', label: 'Matriks & Ekspor', icon: FileSpreadsheet },
    { href: '/sitelist', label: 'Sitelist', icon: MapPin },
    { href: '/import-boq', label: 'Impor BOQ', icon: Upload },
    { href: '/clusters', label: 'Cluster & BOQ', icon: Layers },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <FiberOsLogo className="w-10 h-10 drop-shadow-sm group-hover:scale-105 transition-transform" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600 bg-clip-text text-transparent">
                  FiberOS
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-sky-100 text-sky-800 border border-sky-200 rounded-md">
                  FTTH
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium -mt-1">
                GCI-MTI Blora Rollout
              </p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    link.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/30'
                      : isActive
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${link.highlight ? 'text-white' : isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-2 py-1.5 flex justify-around items-center shadow-lg">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center py-1 px-2 rounded-lg text-[11px] font-medium transition-all ${
                link.highlight && isActive
                  ? 'text-blue-600 font-bold'
                  : isActive
                  ? 'text-blue-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
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
    </header>
  );
}

