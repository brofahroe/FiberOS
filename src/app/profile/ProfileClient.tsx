'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Briefcase,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  ArrowRight,
  Users,
} from 'lucide-react';
import type { SessionUser } from '@/lib/authSession';
import { changePasswordAction, updateProfileAction } from '@/actions/auth';

export default function ProfileClient({
  user,
  isFirstLoginPrompt,
}: {
  user: SessionUser;
  isFirstLoginPrompt: boolean;
}) {
  const router = useRouter();

  // Profile state
  const [fullName, setFullName] = useState(user.fullName);
  const [jobTitle, setJobTitle] = useState(user.jobTitle);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mustChange, setMustChange] = useState(user.mustChangePassword);
  const [completedFirstLogin, setCompletedFirstLogin] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);

    const res = await updateProfileAction({ fullName, jobTitle });
    setSavingProfile(false);

    if (res.success) {
      setProfileMsg({ type: 'success', text: res.message || 'Profil berhasil diperbarui.' });
      router.refresh();
    } else {
      setProfileMsg({ type: 'error', text: res.error || 'Gagal menyimpan profil.' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMsg(null);

    const res = await changePasswordAction({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    setSavingPassword(false);

    if (res.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMustChange(false);
      if (res.wasFirstLogin || isFirstLoginPrompt) {
        setCompletedFirstLogin(true);
      }
      setPasswordMsg({
        type: 'success',
        text: res.message || 'Password berhasil diperbarui.',
      });
      router.refresh();
    } else {
      setPasswordMsg({
        type: 'error',
        text: res.error || 'Gagal mengganti password.',
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Profil Akun &amp; Keamanan
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur Nama Lengkap, Role / Jabatan, serta ganti password akun Anda.
          </p>
        </div>

        {user.role === 'ADMIN' && !mustChange && (
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition self-start sm:self-auto"
          >
            <Users className="w-4 h-4" />
            <span>Kelola User</span>
          </Link>
        )}
      </div>

      {mustChange && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-sm">
              Login Pertama Terdeteksi — Wajib Ganti Password
            </p>
            <p className="text-amber-800 leading-relaxed">
              Demi keamanan akun, silakan ubah password default Anda di bagian <strong>Ganti Password</strong> di bawah sebelum mengakses dashboard atau form input harian.
            </p>
          </div>
        </div>
      )}

      {completedFirstLogin && !mustChange && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Password aktif sudah diperbarui! Akun Anda kini siap digunakan penuh.</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition self-start sm:self-auto"
          >
            <span>Lanjut ke Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Card 1: Profile Info */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            Informasi Profil
          </h2>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 ${
              user.role === 'ADMIN'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            {user.role === 'ADMIN' ? 'Admin' : 'User'}
          </span>
        </div>

        {profileMsg && (
          <div
            className={`p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-medium ${
              profileMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {profileMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{profileMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Username Login
            </label>
            <input
              type="text"
              readOnly
              value={user.username}
              className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Contoh: Fahrudin Hidayat"
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Nama ini otomatis mengisi kolom Nama Pelapor / Pengawas di Input Harian.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role / Jabatan <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Contoh: Supervisor Lapangan / Waspang"
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Briefcase className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-60"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Simpan Profil</span>
          </button>
        </div>
      </form>

      {/* Card 2: Change Password */}
      <form
        onSubmit={handleChangePassword}
        className={`bg-white rounded-2xl p-5 sm:p-6 border shadow-sm space-y-4 ${
          mustChange ? 'border-amber-400 ring-2 ring-amber-200/70' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600" />
            Ganti Password
          </h2>
          {mustChange && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
              Wajib Diisi
            </span>
          )}
        </div>

        {passwordMsg && (
          <div
            className={`p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-medium ${
              passwordMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {passwordMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{passwordMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password Saat Ini <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Password saat ini..."
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                aria-label="Toggle password saat ini"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password Baru <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Minimal 6 karakter..."
                minLength={6}
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowNew((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                aria-label="Toggle password baru"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Konfirmasi Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Ulangi password baru..."
                minLength={6}
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                aria-label="Toggle konfirmasi password"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={savingPassword}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-60"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            <span>Simpan Password Baru</span>
          </button>
        </div>
      </form>
    </div>
  );
}
