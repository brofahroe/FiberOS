import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultUsers } from '@/lib/authServer';
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

  const dbUsers = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      username: true,
      fullName: true,
      jobTitle: true,
      role: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  const initialUsers: AdminUserItem[] = dbUsers.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    jobTitle: u.jobTitle,
    role: u.role === 'ADMIN' ? 'ADMIN' : 'USER',
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="py-2">
      <AdminUsersClient initialUsers={initialUsers} currentUserId={currentUser.id} />
    </div>
  );
}
