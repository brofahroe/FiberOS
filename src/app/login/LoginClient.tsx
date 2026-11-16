'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, LogIn, Loader2, AlertCircle } from 'lucide-react';
import FiberOsLogo from '@/components/FiberOsLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { loginAction } from '@/actions/auth';

export default function LoginClient({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Masukkan username dan password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await loginAction({
        username: username.trim(),
        password,
        redirectTo,
      });

      if (res.success) {
        router.replace(res.redirectTo || '/');
        router.refresh();
      } else {
        setError(res.error || 'Username atau password salah.');
        setSubmitting(false);
      }
    } catch {
      setError('Terjadi kesalahan saat masuk. Silakan coba lagi.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex flex-col items-center justify-center px-2 relative">
      <div className="absolute top-0 right-0">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <FiberOsLogo className="w-14 h-14 drop-shadow-sm" />
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600 dark:from-white dark:via-blue-300 dark:to-sky-300 bg-clip-text text-transparent">
              FiberOS
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider bg-sky-100 text-sky-800 border border-sky-200 rounded-md">
              FTTH
            </span>
          </div>
          <p className="text-xs text-slate-500">
            GCI-MTI Blora Rollout • Silakan login untuk melanjutkan
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username..."
                disabled={submitting}
                autoFocus
                required
                className="w-full px-3.5 py-2.5 pl-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password..."
                disabled={submitting}
                required
                className="w-full px-3.5 py-2.5 pl-10 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 transition transform active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Login...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Masuk</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
