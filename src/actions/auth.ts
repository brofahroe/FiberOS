'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, SESSION_COOKIE_NAME, type UserRole } from '@/lib/auth';
import {
  normalizeAllowedCities,
  normalizePermissions,
  type UserPermissions,
} from '@/lib/permissions';
import {
  ensureDefaultUsers,
  hashPassword,
  setSessionCookieForUser,
  verifyPassword,
} from '@/lib/authServer';

function sanitizeRedirectTarget(target?: string): string {
  if (!target || typeof target !== 'string') return '/';
  const trimmed = target.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/login')) {
    return '/';
  }
  return trimmed;
}

export async function loginAction(data: {
  username: string;
  password: string;
  redirectTo?: string;
}): Promise<{ success: boolean; redirectTo?: string; error?: string }> {
  const usernameInput = (data.username || '').trim();
  const passwordInput = data.password || '';

  if (!usernameInput || !passwordInput) {
    return { success: false, error: 'Masukkan username dan password.' };
  }

  try {
    await ensureDefaultUsers();

    const dbUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: usernameInput,
          mode: 'insensitive',
        },
      },
    });

    if (!dbUser || !verifyPassword(passwordInput, dbUser.passwordHash)) {
      return { success: false, error: 'Username atau password salah.' };
    }

    const role: UserRole = dbUser.role === 'ADMIN' ? 'ADMIN' : 'USER';

    await setSessionCookieForUser({
      id: dbUser.id,
      username: dbUser.username,
      role,
      mustChangePassword: dbUser.mustChangePassword,
    });

    return {
      success: true,
      redirectTo: dbUser.mustChangePassword
        ? '/profile?firstLogin=1'
        : sanitizeRedirectTarget(data.redirectTo),
    };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: 'Terjadi kesalahan saat memproses login.' };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  cookies().delete(SESSION_COOKIE_NAME);
  return { success: true };
}

export async function updateProfileAction(data: {
  fullName: string;
  jobTitle: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: 'Sesi login tidak valid. Silakan login kembali.' };
  }

  const fullName = (data.fullName || '').trim().replace(/\s+/g, ' ');
  const jobTitle = (data.jobTitle || '').trim().replace(/\s+/g, ' ');

  if (!fullName) {
    return { success: false, error: 'Nama Lengkap wajib diisi.' };
  }
  if (!jobTitle) {
    return { success: false, error: 'Role / Jabatan wajib diisi.' };
  }

  try {
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { fullName, jobTitle },
    });

    revalidatePath('/', 'layout');
    revalidatePath('/profile');
    revalidatePath('/daily-input');

    return { success: true, message: 'Profil berhasil diperbarui.' };
  } catch (err) {
    console.error('Update profile error:', err);
    return { success: false, error: 'Gagal menyimpan perubahan profil.' };
  }
}

export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success: boolean; wasFirstLogin?: boolean; error?: string; message?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: 'Sesi login tidak valid. Silakan login kembali.' };
  }

  const currentPassword = data.currentPassword || '';
  const newPassword = data.newPassword || '';
  const confirmPassword = data.confirmPassword || '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: 'Semua kolom password wajib diisi.' };
  }
  if (newPassword.length < 6) {
    return { success: false, error: 'Password baru minimal 6 karakter.' };
  }
  if (newPassword !== confirmPassword) {
    return { success: false, error: 'Konfirmasi password baru tidak cocok.' };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });

    if (!dbUser || !verifyPassword(currentPassword, dbUser.passwordHash)) {
      return { success: false, error: 'Password saat ini tidak sesuai.' };
    }

    if (dbUser.mustChangePassword && newPassword === currentPassword) {
      return {
        success: false,
        error: 'Password baru harus berbeda dari password awal.',
      };
    }

    const wasFirstLogin = dbUser.mustChangePassword;
    const updated = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
      },
    });

    await setSessionCookieForUser({
      id: updated.id,
      username: updated.username,
      role: updated.role === 'ADMIN' ? 'ADMIN' : 'USER',
      mustChangePassword: false,
    });

    revalidatePath('/', 'layout');
    revalidatePath('/profile');

    return {
      success: true,
      wasFirstLogin,
      message: 'Password berhasil diperbarui.',
    };
  } catch (err) {
    console.error('Change password error:', err);
    return { success: false, error: 'Gagal memperbarui password.' };
  }
}

export interface AdminUserItem {
  id: string;
  username: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  permissions: UserPermissions;
  allowedCities: string[];
  mustChangePassword: boolean;
  createdAt: string;
}

export async function createUserAction(data: {
  username: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  permissions?: UserPermissions;
  allowedCities?: string[];
  password: string;
  mustChangePassword: boolean;
}): Promise<{ success: boolean; user?: AdminUserItem; error?: string; message?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return { success: false, error: 'Hanya Admin yang dapat menambahkan user baru.' };
  }

  const username = (data.username || '').trim();
  const fullName = (data.fullName || '').trim().replace(/\s+/g, ' ');
  const jobTitle = (data.jobTitle || '').trim().replace(/\s+/g, ' ') || 'Pengawas Lapangan';
  const role: UserRole = data.role === 'ADMIN' ? 'ADMIN' : 'USER';
  const permissions = normalizePermissions(data.permissions, role);
  const allowedCities = normalizeAllowedCities(data.allowedCities, role);
  const password = data.password || '';

  if (!username || username.length < 3 || /\s/.test(username)) {
    return {
      success: false,
      error: 'Username minimal 3 karakter dan tidak boleh mengandung spasi.',
    };
  }
  if (!fullName) {
    return { success: false, error: 'Nama Lengkap wajib diisi.' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Password awal minimal 6 karakter.' };
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: `Username "${username}" sudah digunakan.` };
    }

    const created = await prisma.user.create({
      data: {
        username,
        fullName,
        jobTitle,
        role,
        permissions: JSON.stringify(permissions),
        allowedCities: JSON.stringify(allowedCities),
        passwordHash: hashPassword(password),
        mustChangePassword: Boolean(data.mustChangePassword),
      },
    });

    revalidatePath('/admin/users');
    revalidatePath('/', 'layout');

    return {
      success: true,
      message: `User "${created.username}" berhasil dibuat.`,
      user: {
        id: created.id,
        username: created.username,
        fullName: created.fullName,
        jobTitle: created.jobTitle,
        role: created.role === 'ADMIN' ? 'ADMIN' : 'USER',
        permissions: normalizePermissions(created.permissions, role),
        allowedCities: normalizeAllowedCities(created.allowedCities, role),
        mustChangePassword: created.mustChangePassword,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (err) {
    console.error('Create user error:', err);
    return { success: false, error: 'Gagal membuat user baru.' };
  }
}

export async function updateUserAccessAction(data: {
  userId: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  permissions: UserPermissions;
  allowedCities: string[];
}): Promise<{ success: boolean; user?: AdminUserItem; error?: string; message?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return { success: false, error: 'Hanya Admin yang dapat mengubah wewenang user.' };
  }

  const fullName = (data.fullName || '').trim().replace(/\s+/g, ' ');
  const jobTitle = (data.jobTitle || '').trim().replace(/\s+/g, ' ') || 'Pengawas Lapangan';
  const requestedRole: UserRole = data.role === 'ADMIN' ? 'ADMIN' : 'USER';

  if (!fullName) {
    return { success: false, error: 'Nama Lengkap wajib diisi.' };
  }
  if (data.userId === currentUser.id && requestedRole !== 'ADMIN') {
    return {
      success: false,
      error: 'Tidak dapat menurunkan hak akses akun Admin yang sedang Anda gunakan.',
    };
  }

  const permissions = normalizePermissions(data.permissions, requestedRole);
  const allowedCities = normalizeAllowedCities(data.allowedCities, requestedRole);

  try {
    const updated = await prisma.user.update({
      where: { id: data.userId },
      data: {
        fullName,
        jobTitle,
        role: requestedRole,
        permissions: JSON.stringify(permissions),
        allowedCities: JSON.stringify(allowedCities),
      },
    });

    const resolvedRole: UserRole = updated.role === 'ADMIN' ? 'ADMIN' : 'USER';

    revalidatePath('/admin/users');
    revalidatePath('/', 'layout');

    return {
      success: true,
      message: `Wewenang & Kota user "${updated.username}" berhasil diperbarui.`,
      user: {
        id: updated.id,
        username: updated.username,
        fullName: updated.fullName,
        jobTitle: updated.jobTitle,
        role: resolvedRole,
        permissions: normalizePermissions(updated.permissions, resolvedRole),
        allowedCities: normalizeAllowedCities(updated.allowedCities, resolvedRole),
        mustChangePassword: updated.mustChangePassword,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  } catch (err) {
    console.error('Update user access error:', err);
    return { success: false, error: 'Gagal memperbarui wewenang user.' };
  }
}

export async function resetUserPasswordByAdminAction(data: {
  userId: string;
  newPassword: string;
  mustChangePassword: boolean;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return { success: false, error: 'Akses ditolak.' };
  }

  const newPassword = data.newPassword || '';
  if (newPassword.length < 6) {
    return { success: false, error: 'Password baru minimal 6 karakter.' };
  }

  try {
    const target = await prisma.user.update({
      where: { id: data.userId },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: Boolean(data.mustChangePassword),
      },
    });

    revalidatePath('/admin/users');
    return {
      success: true,
      message: `Password user "${target.username}" berhasil direset.`,
    };
  } catch (err) {
    console.error('Admin reset password error:', err);
    return { success: false, error: 'Gagal mereset password user.' };
  }
}

export async function deleteUserByAdminAction(
  userId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return { success: false, error: 'Akses ditolak.' };
  }
  if (currentUser.id === userId) {
    return { success: false, error: 'Tidak dapat menghapus akun yang sedang login.' };
  }

  try {
    const deleted = await prisma.user.delete({
      where: { id: userId },
    });
    revalidatePath('/admin/users');
    return {
      success: true,
      message: `User "${deleted.username}" berhasil dihapus.`,
    };
  } catch (err) {
    console.error('Delete user error:', err);
    return { success: false, error: 'Gagal menghapus user.' };
  }
}
