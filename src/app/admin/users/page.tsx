import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultUsers } from '@/lib/authServer';
import {
  DEFAULT_USER_CITY,
  normalizeAllowedCities,
  normalizePermissions,
  type UserRole,
} from '@/lib/permissions';
import sitelistData from '@/data/sitelist.json';
import type { AdminUserItem } from '@/actions/auth';
import AdminUsersClient from './AdminUsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (currentUser.role !== 'ADMIN') {
    redirect('/');
  }

  await ensureDefaultUsers();

  const [dbUsers, dbClusters] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        username: true,
        fullName: true,
        jobTitle: true,
        role: true,
        permissions: true,
        allowedCities: true,
        mustChangePassword: true,
        createdAt: true,
      },
    }),
    prisma.cluster.findMany({
      select: { kabupaten: true },
    }),
  ]);

  const citySet = new Set<string>([DEFAULT_USER_CITY]);
  for (const s of sitelistData.sites) {
    if (s.kabupaten) citySet.add(s.kabupaten.trim());
  }
  for (const c of dbClusters) {
    if (c.kabupaten) citySet.add(c.kabupaten.trim());
  }
  const availableCities = Array.from(citySet).filter(Boolean).sort();

  const initialUsers: AdminUserItem[] = dbUsers.map((u) => {
    const role: UserRole = u.role === 'ADMIN' ? 'ADMIN' : 'USER';
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      jobTitle: u.jobTitle,
      role,
      permissions: normalizePermissions(u.permissions, role),
      allowedCities: normalizeAllowedCities(u.allowedCities, role),
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt.toISOString(),
    };
  });

  return (
    <div className="py-2">
      <AdminUsersClient
        initialUsers={initialUsers}
        currentUserId={currentUser.id}
        availableCities={availableCities}
      />
    </div>
  );
}
