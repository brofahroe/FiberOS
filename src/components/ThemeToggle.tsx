'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      localStorage.setItem('fiberos_theme', nextDark ? 'dark' : 'light');
    } catch {
      // Ignore storage restrictions
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', nextDark ? '#020617' : '#0f172a');
    }
  };

  if (!mounted) {
    return (
      <div
        className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Ganti ke Tema Terang (Light)' : 'Ganti ke Tema Gelap (Dark)'}
      aria-label={isDark ? 'Ganti ke Tema Terang' : 'Ganti ke Tema Gelap'}
      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 text-xs font-semibold transition-all shadow-xs"
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-amber-300" />
          <span className="hidden lg:inline text-slate-200">Light</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-slate-700" />
          <span className="hidden lg:inline text-slate-700">Dark</span>
        </>
      )}
    </button>
  );
}
