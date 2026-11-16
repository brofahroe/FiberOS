'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserPlus,
  ShieldCheck,
  KeyRound,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { UserRole } from '@/lib/authSession';
import {
  createUserAction,
  deleteUserByAdminAction,
  resetUserPasswordByAdminAction,
  type AdminUserItem,
} from '@/actions/auth';

export default function AdminUsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUserItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers);

  // Create form state
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('Pengawas Lapangan');
  const [role, setRole] = useState<UserRole>('USER');
  const [password, setPassword] = useState('Password123');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset password state
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('Password123');
  const [resetMustChange, setResetMustChange] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFeedback(null);

    const res = await createUserAction({
      username,
      fullName,
      jobTitle,
      role,
      password,
      mustChangePassword,
    });
    setCreating(false);

    if (res.success && res.user) {
      setUsers((prev) => [...prev, res.user!]);
      setUsername('');
      setFullName('');
      setJobTitle('Pengawas Lapangan');
      setRole('USER');
      setPassword('Password123');
      setMustChangePassword(true);
      setFeedback({ type: 'success', text: res.message || 'User berhasil dibuat.' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal membuat user.' });
    }
  };

  const handleResetPassword = async (userId: string) => {
    setResetting(true);
    setFeedback(null);

    const res = await resetUserPasswordByAdminAction({
      userId,
      newPassword: resetPasswordVal,
      mustChangePassword: resetMustChange,
    });
    setResetting(false);

    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, mustChangePassword: resetMustChange } : u))
      );
      setResetTargetId(null);
      setFeedback({ type: 'success', text: res.message || 'Password berhasil direset.' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal mereset password.' });
    }
  };

  const handleDeleteUser = async (user: AdminUserItem) => {
    if (!confirm(`Yakin ingin menghapus user "${user.username}" (${user.fullName})?`)) {
      return;
    }

    setDeletingId(user.id);
    setFeedback(null);
    const res = await deleteUserByAdminAction(user.id);
    setDeletingId(null);

    if (res.success) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setFeedback({ type: 'success', text: res.message || 'User berhasil dihapus.' });
      router.refresh();
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menghapus user.' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-indigo-600" />
          Manajemen User FiberOS
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Khusus Admin: tambah user baru, atur Role / Jabatan awal, atau reset password akun.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs sm:text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Create User Form */}
      <form
        onSubmit={handleCreateUser}
        className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4"
      >
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-600" />
          Buat User Baru
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Username <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Contoh: Budi"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role / Jabatan <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Contoh: Pengawas Lapangan"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hak Akses Sistem
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value === 'ADMIN' ? 'ADMIN' : 'USER')}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="USER">User (Standar - Input &amp; Monitoring)</option>
              <option value="ADMIN">Admin (Bisa Kelola User)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password Awal <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                aria-label="Toggle password awal"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mustChangePassword}
                onChange={(e) => setMustChangePassword(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Wajib ganti password saat login pertama</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>Tambah User</span>
          </button>
        </div>
      </form>

      {/* Registered Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Daftar Akun Terdaftar ({users.length})
          </h2>
        </div>

        <div className="divide-y divide-slate-100">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const isResetOpen = resetTargetId === u.id;

            return (
              <div key={u.id} className="p-4 sm:px-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{u.fullName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-mono">
                        @{u.username}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                          u.role === 'ADMIN'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        {u.role}
                      </span>
                      {u.mustChangePassword ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Wajib Ganti Password
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Aktif
                        </span>
                      )}
                      {isSelf && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                          Akun Anda
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Role / Jabatan: <strong className="text-slate-700">{u.jobTitle}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (isResetOpen) {
                          setResetTargetId(null);
                        } else {
                          setResetTargetId(u.id);
                          setResetPasswordVal('Password123');
                          setResetMustChange(true);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-xs font-semibold transition"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Reset Password</span>
                    </button>

                    {!isSelf && (
                      <button
                        type="button"
                        disabled={deletingId === u.id}
                        onClick={() => handleDeleteUser(u)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition disabled:opacity-60"
                      >
                        {deletingId === u.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>

                {isResetOpen && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <input
                      type="text"
                      value={resetPasswordVal}
                      onChange={(e) => setResetPasswordVal(e.target.value)}
                      placeholder="Password baru minimal 6 karakter..."
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={resetMustChange}
                        onChange={(e) => setResetMustChange(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
                      />
                      <span>Wajib ganti pas login</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={resetting}
                        onClick={() => handleResetPassword(u.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition disabled:opacity-60"
                      >
                        {resetting ? 'Menyimpan...' : 'Simpan Reset'}
                      </button>
                      <button
                        type="button"
                        disabled={resetting}
                        onClick={() => setResetTargetId(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-semibold"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
